import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BeatmapDecoder, ModHidden, Modes } from "@rian8337/osu-base";
import { DroidDifficultyCalculator } from "@rian8337/osu-difficulty-calculator";
import {
    beatmapFixtureNames,
    beatmapFixtures,
    hasReplayFixture,
    md5Of,
    readBeatmapFixture,
    replayFixture,
} from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtempDisposable, readFile } from "node:fs/promises";
import { Agent, createServer, request, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const processorDir = fileURLToPath(new URL("../../", import.meta.url));
const apiKey = "e2e-api-key-0123456789";

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createNetServer().listen(0, "127.0.0.1", () => {
            const address = server.address();

            server.close(() =>
                typeof address === "object" && address
                    ? resolve(address.port)
                    : reject(new Error("no port")),
            );
        });
    });
}

/**
 * A stand-in for the beatmap service, serving the fixtures.
 */
function startBeatmapService(port: number): Promise<Server> {
    const beatmaps = beatmapFixtureNames.map((name) => {
        const bytes = Buffer.from(readBeatmapFixture(name));

        return { id: beatmapFixtures[name].id, hash: md5Of(bytes), bytes };
    });

    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = url.searchParams.get("id");
        const hash = url.searchParams.get("hash");
        const beatmap = beatmaps.find((b) =>
            id ? b.id === Number(id) : b.hash === hash,
        );

        if (!beatmap) {
            res.writeHead(404).end();
            return;
        }

        if (url.pathname.endsWith("/getbeatmapfile")) {
            res.writeHead(200, { "Content-Type": "text/plain" }).end(
                beatmap.bytes,
            );
        } else {
            res.writeHead(200, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                    beatmap_id: beatmap.id.toString(),
                    file_md5: beatmap.hash,
                }),
            );
        }
    });

    return new Promise((resolve) =>
        server.listen(port, "127.0.0.1", () => resolve(server)),
    );
}

describe("processor snapshot (e2e)", () => {
    const resources = new AsyncDisposableStack();
    let databasePort: number;
    let processor: ChildProcess;
    let baseUrl: string;
    let output = "";

    const post = (path: string, body: unknown, key: string | null = apiKey) =>
        fetch(`${baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(key && { "X-Api-Key": key }),
            },
            body: JSON.stringify(body),
        });

    beforeAll(async () => {
        // The snapshot keeps `piscina` and `canvas` external, so it must sit below `apps/processor` to resolve them
        // from its `node_modules`. `releases` is git-ignored.
        const releasesRoot = join(processorDir, "releases");

        await mkdir(releasesRoot, { recursive: true });

        const releases = resources.use(
            await mkdtempDisposable(join(releasesRoot, "e2e-")),
        );

        execFileSync(
            "node",
            [
                "scripts/build-variant.ts",
                "e2e-droid",
                "--mode",
                Modes.Droid,
                "--algorithm",
                "live",
                "--releases-dir",
                releases.path,
                "--activate",
            ],
            { cwd: processorDir, stdio: "inherit" },
        );

        databasePort = await freePort();
        const database = resources.use(new PGlite());
        const databaseServer = new PGLiteSocketServer({
            db: database,
            host: "127.0.0.1",
            port: databasePort,
            maxConnections: 10,
        });

        await databaseServer.start();
        resources.defer(() => databaseServer.stop());

        const beatmapPort = await freePort();
        resources.use(await startBeatmapService(beatmapPort));

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port.toString()}`;

        processor = spawn(
            "node",
            [join(releases.path, "e2e-droid", "current", "index.mjs")],
            {
                env: {
                    ...process.env,
                    CI: "1",
                    PORT: port.toString(),
                    DATABASE_HOST: "127.0.0.1",
                    DATABASE_PORT: databasePort.toString(),
                    DATABASE_NAME: "postgres",
                    DATABASE_USER: "postgres",
                    DATABASE_PASSWORD: "",
                    BEATMAP_SERVICE_URL: `http://127.0.0.1:${beatmapPort.toString()}/api/beatmap`,
                    API_KEY: apiKey,
                    CALCULATION_THREADS: "2",
                },
            },
        );

        resources.defer(() => {
            if (processor.exitCode === null) {
                processor.kill("SIGKILL");
            }
        });

        processor.stdout?.on(
            "data",
            (chunk: Buffer) => (output += chunk.toString()),
        );
        processor.stderr?.on(
            "data",
            (chunk: Buffer) => (output += chunk.toString()),
        );

        for (let attempt = 0; ; attempt++) {
            const ready = await fetch(`${baseUrl}/info`)
                .then((r) => r.ok)
                .catch(() => false);

            if (ready) {
                break;
            }

            if (attempt > 100 || processor.exitCode !== null) {
                throw new Error(`Processor did not start:\n${output}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    });

    afterAll(() => resources.disposeAsync());

    it("reports the variant from its manifest", async () => {
        const info: unknown = await (await fetch(`${baseUrl}/info`)).json();

        expect(info).toMatchObject({
            id: "e2e-droid",
            mode: Modes.Droid,
            algorithm: "live",
            calculatorVersion: expect.stringMatching(/^[0-9a-f]{16}$/),
        });
        expect(output).toContain("[e2e-droid]");
    });

    it("rejects requests without the API key", async () => {
        expect(
            (await post("/difficulty", { beatmap: { id: 1 } }, null)).status,
        ).toBe(401);
    });

    it("calculates difficulty through the worker pool, matching the calculator", async () => {
        const response = await post("/difficulty", {
            beatmap: { id: beatmapFixtures.loveLetter.id },
            mods: modMap(new ModHidden()).serializeMods(),
        });

        const expected = new DroidDifficultyCalculator().calculate(
            new BeatmapDecoder().decode(
                readBeatmapFixture("loveLetter"),
                Modes.Droid,
            ).result,
            modMap(new ModHidden()),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            difficulty: { starRating: expected.starRating },
        });
    });

    it("stores attributes in Postgres once", async () => {
        await post("/difficulty", {
            beatmap: { id: beatmapFixtures.discoprince.id },
        });
        await post("/difficulty", {
            beatmap: { id: beatmapFixtures.discoprince.id },
        });

        await using connection = new AsyncDisposableStack();
        const client = new pg.Client({
            host: "127.0.0.1",
            port: databasePort,
            user: "postgres",
            database: "postgres",
        });

        await client.connect();
        connection.defer(() => client.end());

        const result = await client.query<{ count: string }>(
            "select count(*) from difficulty_attributes where beatmap_hash = $1",
            [md5Of(Buffer.from(readBeatmapFixture("discoprince")))],
        );

        expect(result.rows[0]?.count).toBe("1");
    });

    it("calculates performance with a strain chart", async () => {
        const response = await post("/performance", {
            beatmap: { id: beatmapFixtures.highPowered.id },
            score: { n100: 3 },
            strainChart: true,
        });

        expect(response.status).toBe(200);

        const body: unknown = await response.json();

        expect(body).toMatchObject({
            performance: { total: expect.any(Number) },
            strainChart: expect.any(String),
        });

        const chart =
            typeof body === "object" && body !== null && "strainChart" in body
                ? body.strainChart
                : undefined;

        expect(
            Buffer.from(String(chart), "base64").subarray(1, 4).toString(),
        ).toBe("PNG");
    });

    it("calculates uploaded beatmaps", async () => {
        const response = await post("/performance", {
            beatmap: { file: readBeatmapFixture("discoprince") },
        });

        expect(response.status).toBe(200);
    });

    it.skipIf(!hasReplayFixture)("calculates replay performance", async () => {
        // The replay's beatmap must be served by the stub beatmap service; add it to beatmapFixtures when the
        // fixture is provided.
        const replay = (await readFile(replayFixture.replay)).toString(
            "base64",
        );
        const response = await post("/performance/replay", { replay });

        expect(response.status).toBe(200);
    });

    it("shuts down cleanly on SIGTERM while keep-alive requests are in flight", async () => {
        const agent = new Agent({ keepAlive: true, maxSockets: 2 });
        const url = new URL("/info", baseUrl);
        let sent = 0;
        let stop = false;

        const getInfo = () =>
            new Promise<void>((resolve, reject) => {
                request(url, { agent }, (res) => {
                    res.resume();
                    res.on("end", resolve);
                })
                    .on("error", reject)
                    .end();
            });

        // Two clients that send requests back to back on kept-alive connections, like the broker would.
        const clients = [0, 1].map(async () => {
            while (!stop) {
                try {
                    await getInfo();
                    sent++;
                } catch {
                    // The processor stops accepting connections once it has shut down.
                    return;
                }
            }
        });

        await vi.waitFor(() => expect(sent).toBeGreaterThan(10));

        const exited = new Promise<number | null>((resolve) =>
            processor.once("exit", (code) => resolve(code)),
        );

        processor.kill("SIGTERM");

        expect(await exited).toBe(0);
        expect(output).toContain("Received SIGTERM");
        expect(output).not.toContain("did not finish within");

        stop = true;
        await Promise.all(clients);
        agent.destroy();
    });
});
