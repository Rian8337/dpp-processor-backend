import { ConfigError, loadCliConfig, loadConfig } from "@/config/config";
import { describe, expect, it } from "vitest";

const cliEnvironment = {
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "score_service",
    DATABASE_USER: "postgres",
    OFFICIAL_DB_HOST: "localhost",
    OFFICIAL_DB_NAME: "osudroid",
    OFFICIAL_DB_USER: "root",
    BROKER_URL: "http://127.0.0.1:4000/",
    BROKER_API_KEY: "broker-key-0123456789",
    BEATMAP_SERVICE_URL: "http://127.0.0.1:5000",
    BEATMAP_SERVICE_KEY: "beatmap-key",
    BEATMAP_SERVICE_BULK_KEY: "beatmap-bulk-key",
    LIVE_DROID_VARIANT: "live-droid",
    LIVE_OSU_VARIANT: "live-osu",
    UNPROCESSED_REPLAY_DIR: "/replays/unprocessed",
    ONLINE_REPLAY_DIR: "/replays/online",
    BEST_REPLAY_DIR: "/replays/best",
    UNCALCULATED_REPLAY_DIR: "/replays/uncalculated",
};

const serverEnvironment = {
    ...cliEnvironment,
    PORT: "3100",
    API_KEY: "score-service-key-0123",
    ALICE_DB_URI: "mongodb://localhost/alice",
    ELAINA_DB_URI: "mongodb://localhost/elaina",
    DISCORD_METADATA_URL: "http://127.0.0.1:3200/api/discord/update-metadata",
    DISCORD_METADATA_KEY: "discord-key",
};

describe("loadConfig", () => {
    it("reads every variable with defaults", () => {
        expect(loadConfig(serverEnvironment)).toEqual({
            port: 3100,
            host: "127.0.0.1",
            apiKey: "score-service-key-0123",
            database: {
                host: "localhost",
                port: 5432,
                name: "score_service",
                user: "postgres",
                password: "",
            },
            official: {
                host: "localhost",
                port: 3306,
                name: "osudroid",
                user: "root",
                password: "",
                tablePrefix: "bbl_",
            },
            mongo: {
                aliceUri: "mongodb://localhost/alice",
                elainaUri: "mongodb://localhost/elaina",
            },
            broker: {
                url: "http://127.0.0.1:4000",
                apiKey: "broker-key-0123456789",
            },
            beatmapService: {
                url: "http://127.0.0.1:5000",
                key: "beatmap-key",
                bulkKey: "beatmap-bulk-key",
            },
            variants: { liveDroid: "live-droid", liveOsu: "live-osu" },
            replayDirectories: {
                unprocessed: "/replays/unprocessed",
                online: "/replays/online",
                best: "/replays/best",
                uncalculated: "/replays/uncalculated",
            },
            discordMetadata: {
                url: "http://127.0.0.1:3200/api/discord/update-metadata",
                key: "discord-key",
            },
            replayConcurrency: 2,
            uncalculatedConcurrency: 1,
            uncalculatedIntervalMinutes: 10,
            danCourseRefreshMinutes: 60,
        });
    });

    it("names invalid variables without their values", () => {
        let error: unknown;

        try {
            loadConfig({
                ...serverEnvironment,
                API_KEY: "short-secret",
                PORT: "0",
                LIVE_DROID_VARIANT: "Live Droid",
                REPLAY_CONCURRENCY: "0",
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeInstanceOf(ConfigError);
        const message = (error as ConfigError).message;

        expect(message).toContain("API_KEY");
        expect(message).toContain("PORT");
        expect(message).toContain("LIVE_DROID_VARIANT");
        expect(message).toContain("REPLAY_CONCURRENCY");
        expect(message).not.toContain("short-secret");
    });

    it("treats empty variables as unset", () => {
        expect(() => loadConfig({ ...serverEnvironment, PORT: "" })).toThrow(
            ConfigError,
        );
        expect(loadConfig({ ...serverEnvironment, HOST: "" }).host).toBe(
            "127.0.0.1",
        );
    });

    it("rejects relative replay folders", () => {
        expect(() =>
            loadConfig({ ...serverEnvironment, BEST_REPLAY_DIR: "replays" }),
        ).toThrow(ConfigError);
    });
});

describe("loadCliConfig", () => {
    it("needs only the CLI variables", () => {
        const config = loadCliConfig(cliEnvironment);

        expect(config.official.tablePrefix).toBe("bbl_");
        expect(config).not.toHaveProperty("mongo");
    });

    it("reads a custom table prefix", () => {
        expect(
            loadCliConfig({ ...cliEnvironment, OFFICIAL_DB_PREFIX: "test_" })
                .official.tablePrefix,
        ).toBe("test_");
    });
});
