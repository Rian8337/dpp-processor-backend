import {
    freePort,
    startProcess,
    startTestPostgres,
    type StartedProcess,
} from "@dpp/server/testing";
import type { ReplayPerformanceResponse } from "@dpp/shared";
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
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtempDisposable, readFile } from "node:fs/promises";
import { Agent, createServer, request, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const processorDir = fileURLToPath(new URL("../../", import.meta.url));
const apiKey = "e2e-api-key-0123456789";

/**
 * A stand-in for the beatmap service, serving the fixtures.
 */
function startBeatmapService(port: number): Promise<Server> {
    const beatmaps: { id: number; hash: string; bytes: Buffer }[] =
        beatmapFixtureNames.map((name) => {
            const bytes = Buffer.from(readBeatmapFixture(name));

            return { id: beatmapFixtures[name].id, hash: md5Of(bytes), bytes };
        });

    // The replay fixture's beatmap, found by the hash the replay records.
    if (hasReplayFixture) {
        const bytes = readFileSync(replayFixture.beatmap);

        beatmaps.push({ id: 1000, hash: md5Of(bytes), bytes });
    }

    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = url.searchParams.get("id");
        const hash = url.searchParams.get("hash");
        const beatmap = beatmaps.find((b) =>
            id ? b.id === Number(id) : b.hash === hash,
        );

        if (!beatmap) {
            res.writeHead(404, { "Content-Type": "application/json" }).end(
                JSON.stringify({ error: "Beatmap not found" }),
            );
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
    let processor: StartedProcess;
    let baseUrl: string;
    let snapshotDirectory: string;
    let processorEnvironment: NodeJS.ProcessEnv;

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

        const postgres = resources.use(await startTestPostgres());

        databasePort = postgres.port;

        const beatmapPort = await freePort();
        resources.use(await startBeatmapService(beatmapPort));

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port.toString()}`;

        snapshotDirectory = join(releases.path, "e2e-droid", "current");
        processorEnvironment = {
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
        };

        processor = resources.use(
            await startProcess({
                script: join(snapshotDirectory, "index.mjs"),
                env: processorEnvironment,
                readyUrl: `${baseUrl}/info`,
            }),
        );
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
        expect(processor.output()).toContain("[e2e-droid]");
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
        const replay = (await readFile(replayFixture.replay)).toString(
            "base64",
        );
        const response = await post("/performance/replay", { replay });

        expect(response.status).toBe(200);

        const body = (await response.json()) as ReplayPerformanceResponse;

        // The fixture is an S rank: 1141/36/2/0, 1481 max combo.
        expect(body.score).toMatchObject({
            n300: 1141,
            n100: 36,
            n50: 2,
            nmiss: 0,
            combo: 1481,
        });
        expect(body.performance.total).toBeGreaterThan(0);
        expect(body.replay.hitError).not.toBeNull();
    });

    it("prunes attributes of other calculator versions with the built prune command", async () => {
        await using connection = new AsyncDisposableStack();
        const client = new pg.Client({
            host: "127.0.0.1",
            port: databasePort,
            user: "postgres",
            database: "postgres",
        });

        await client.connect();
        connection.defer(() => client.end());

        await client.query(
            "insert into difficulty_attributes (calculator_version, beatmap_hash, mods, attributes) values ('0000000000000000', $1, '[]', '{}')",
            ["f".repeat(32)],
        );

        // Runs the built prune.mjs, which catches bundling-order regressions (such as reflect-metadata) that only
        // show when the file runs.
        const { stdout } = await promisify(execFile)(
            "node",
            [join(snapshotDirectory, "prune.mjs")],
            {
                // Only the database variables: prune must not need the server's settings.
                env: {
                    PATH: process.env.PATH,
                    CI: "1",
                    DATABASE_HOST: "127.0.0.1",
                    DATABASE_PORT: databasePort.toString(),
                    DATABASE_NAME: "postgres",
                    DATABASE_USER: "postgres",
                },
            },
        );

        expect(stdout).toMatch(/Deleted 1 rows not from calculator version/);

        const remaining = await client.query<{ count: string }>(
            "select count(*) from difficulty_attributes where calculator_version = '0000000000000000'",
        );

        expect(remaining.rows[0]?.count).toBe("0");
    });

    it("refuses prune arguments before reading any configuration", async () => {
        const failure = await promisify(execFile)(
            "node",
            [join(snapshotDirectory, "prune.mjs"), "--all"],
            { env: { PATH: process.env.PATH, CI: "1" } },
        ).then(
            () => {
                throw new Error("expected prune to fail");
            },
            (e: unknown) => e as { code: number; stderr: string },
        );

        expect(failure.code).toBe(1);
        expect(failure.stderr).toContain("takes no arguments");
        expect(failure.stderr).not.toContain("DATABASE_");
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

        processor.child.kill("SIGTERM");

        expect(await processor.exited).toBe(0);
        expect(processor.output()).toContain("Received SIGTERM");
        expect(processor.output()).not.toContain("did not finish within");

        stop = true;
        await Promise.all(clients);
        agent.destroy();
    });
});
