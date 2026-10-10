import { startTestMariaDb, hasMariaDb } from "@test/utils/mariadb";
import { createOfficialTestDatabase } from "@test/utils/officialDatabase";
import { startTestMongo } from "@test/utils/mongo";
import { readReplayFixture } from "@test/utils/fixtures";
import {
    startStubBeatmapService,
    startStubBroker,
    startStubDiscord,
} from "@test/utils/stubServices";
import { parseReplay } from "@/replays/parseReplay";
import {
    freePort,
    startProcess,
    startTestPostgres,
    type StartedProcess,
} from "@dpp/server/testing";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempDisposable, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const serviceDir = fileURLToPath(new URL("../../", import.meta.url));
const testHash = "0123456789abcdef0123456789abcdef";
const apiKey = "e2e-score-service-key-0123";

/**
 * Runs `node <script>` with exactly this environment (nothing inherited, and `CI=1` keeps a developer's `.env`
 * file out).
 */
function runNode(
    script: string,
    env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn("node", [script], { env });
        let stderr = "";

        child.stderr.on(
            "data",
            (chunk: Buffer) => (stderr += chunk.toString()),
        );
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, stderr }));
    });
}

beforeAll(() => {
    execFileSync("pnpm", ["run", "build"], {
        cwd: serviceDir,
        stdio: "inherit",
    });
}, 180_000);

describe("score service (e2e)", () => {
    it("stops with a message naming missing variables", async () => {
        const { code, stderr } = await runNode(
            join(serviceDir, "dist", "index.mjs"),
            { PATH: process.env.PATH, CI: "1" },
        );

        expect(code).toBe(1);
        expect(stderr).toContain("PORT");
        expect(stderr).toContain("BROKER_URL");
    });

    it("refuses to run the CLI without its variables", async () => {
        const { code, stderr } = await runNode(
            join(serviceDir, "dist", "cli.mjs"),
            { PATH: process.env.PATH, CI: "1" },
        );

        expect(code).toBe(1);
        expect(stderr).toContain("OFFICIAL_DB_HOST");
    });
});

describe.skipIf(!(await hasMariaDb()))("score service server (e2e)", () => {
    const resources = new AsyncDisposableStack();
    let service: StartedProcess;
    let baseUrl: string;
    let broker: Awaited<ReturnType<typeof startStubBroker>>;
    let discord: Awaited<ReturnType<typeof startStubDiscord>>;
    let official: Awaited<ReturnType<typeof createOfficialTestDatabase>>;
    let mongo: MongoClient;
    let folders: {
        unprocessed: string;
        online: string;
        best: string;
        uncalculated: string;
    };

    beforeAll(async () => {
        try {
            const postgres = resources.use(await startTestPostgres());
            const mariadb = resources.use(await startTestMariaDb());

            official = resources.use(
                await createOfficialTestDatabase(mariadb.settings),
            );
            await official.connection.db
                .insert(official.connection.tables.users)
                .values({ id: 7, username: "player" });

            const testMongo = resources.use(await startTestMongo());

            mongo = await MongoClient.connect(testMongo.uri);
            resources.defer(() => mongo.close());
            // The server is fresh, so the fixed database names are safe.
            await mongo
                .db("ElainaDB")
                .collection("userbind")
                .insertOne({ discordid: "discord-7", previous_bind: [7] });

            broker = resources.use(await startStubBroker());
            const beatmaps = resources.use(await startStubBeatmapService());

            discord = resources.use(await startStubDiscord());

            const [unprocessed, online, best, uncalculated] = [
                resources.use(
                    await mkdtempDisposable(join(tmpdir(), "unprocessed-")),
                ),
                resources.use(
                    await mkdtempDisposable(join(tmpdir(), "online-")),
                ),
                resources.use(await mkdtempDisposable(join(tmpdir(), "best-"))),
                resources.use(
                    await mkdtempDisposable(join(tmpdir(), "uncalculated-")),
                ),
            ];

            folders = {
                unprocessed: unprocessed.path,
                online: online.path,
                best: best.path,
                uncalculated: uncalculated.path,
            };

            const port = await freePort();

            baseUrl = `http://127.0.0.1:${port.toString()}`;

            service = resources.use(
                await startProcess({
                    script: join(serviceDir, "dist", "index.mjs"),
                    env: {
                        PATH: process.env.PATH,
                        CI: "1",
                        PORT: port.toString(),
                        HOST: "127.0.0.1",
                        API_KEY: apiKey,
                        DATABASE_HOST: "127.0.0.1",
                        DATABASE_PORT: postgres.port.toString(),
                        DATABASE_NAME: "postgres",
                        DATABASE_USER: "postgres",
                        DATABASE_PASSWORD: "",
                        OFFICIAL_DB_HOST: official.settings.host,
                        OFFICIAL_DB_PORT: official.settings.port.toString(),
                        OFFICIAL_DB_NAME: official.settings.name,
                        OFFICIAL_DB_USER: official.settings.user,
                        OFFICIAL_DB_PASSWORD: official.settings.password,
                        OFFICIAL_DB_PREFIX: official.settings.tablePrefix,
                        ALICE_DB_URI: testMongo.uri,
                        ELAINA_DB_URI: testMongo.uri,
                        BROKER_URL: broker.url,
                        BROKER_API_KEY: "e2e-broker-key",
                        BEATMAP_SERVICE_URL: beatmaps.url,
                        BEATMAP_SERVICE_KEY: "e2e-beatmap-key",
                        BEATMAP_SERVICE_BULK_KEY: "e2e-beatmap-bulk-key",
                        LIVE_DROID_VARIANT: "live-droid",
                        LIVE_OSU_VARIANT: "live-osu",
                        UNPROCESSED_REPLAY_DIR: folders.unprocessed,
                        ONLINE_REPLAY_DIR: folders.online,
                        BEST_REPLAY_DIR: folders.best,
                        UNCALCULATED_REPLAY_DIR: folders.uncalculated,
                        DISCORD_METADATA_URL: `${discord.url}/update`,
                        DISCORD_METADATA_KEY: "e2e-discord-key",
                    },
                    readyUrl: `${baseUrl}/online-scores`,
                    isReady: (response) => response.status === 401,
                }),
            );
        } catch (e) {
            await resources.disposeAsync();
            throw e;
        }
    });

    afterAll(() => resources.disposeAsync());

    it("answers /calculate-score in pp-processor-node's format", async () => {
        const response = await fetch(`${baseUrl}/calculate-score`, {
            method: "POST",
            body: new URLSearchParams({
                hash: testHash,
                mods: "[]",
                combo: "100",
                perfect: "90",
                good: "5",
                bad: "1",
                miss: "0",
                total_score: "1000",
            }),
        });

        expect(await response.json()).toEqual({ pp: 90, pp_multiplier: 0.9 });
    });

    it("answers null for an invalid /calculate-score", async () => {
        const response = await fetch(`${baseUrl}/calculate-score`, {
            method: "POST",
            body: new URLSearchParams({ hash: "x" }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            pp: null,
            pp_multiplier: null,
        });
    });

    it("requires the API key for /online-scores", async () => {
        const response = await fetch(
            `${baseUrl}/online-scores?uid=7&hash=${testHash}&variant=live-droid`,
        );

        expect(response.status).toBe(401);
    });

    it.skipIf(!readReplayFixture("v3"))(
        "processes and deletes a dropped replay",
        async () => {
            const replay = readReplayFixture("v3")!;
            const parsed = (await parseReplay(replay))!;

            // The fixture's player must exist for the replay to be stored.
            await official.connection.db
                .insert(official.connection.tables.users)
                .values({ id: 8, username: parsed.v3!.playerName });
            await mongo
                .db("ElainaDB")
                .collection("userbind")
                .insertOne({ discordid: "discord-8", previous_bind: [8] });
            await writeFile(join(folders.unprocessed, "123_x.odr"), replay);

            await vi.waitFor(
                async () =>
                    expect(await readdir(folders.unprocessed)).toEqual([]),
                { timeout: 20_000 },
            );

            const replayCalls = broker.requests
                .filter((r) => r.path.endsWith("/performance/replay"))
                .map((r) => r.path);

            expect(replayCalls).toEqual(
                expect.arrayContaining([
                    "/variants/live-droid/performance/replay",
                    "/variants/live-osu/performance/replay",
                ]),
            );
            expect(
                await mongo
                    .db("AliceDB")
                    .collection("recentplays")
                    .countDocuments({ uid: 8, scoreId: 123 }),
            ).toBe(1);
            expect(discord.bodies).toContainEqual(
                expect.objectContaining({ userId: "discord-8" }),
            );
        },
    );

    it("shuts down cleanly on SIGTERM", async () => {
        service.child.kill("SIGTERM");

        expect(await service.exited).toBe(0);
    });
});
