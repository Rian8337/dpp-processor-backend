import type { Config } from "@/config/config";

export const testApiKey = "test-score-service-key-0123";

/**
 * Settings for tests. Replay folders are placeholders; tests that touch disk pass their own.
 */
export const testConfig: Config = {
    port: 0,
    host: "127.0.0.1",
    apiKey: testApiKey,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    official: {
        host: "localhost",
        port: 3306,
        name: "test",
        user: "test",
        password: "",
        tablePrefix: "bbl_",
    },
    mongo: { aliceUri: "mongodb://unused", elainaUri: "mongodb://unused" },
    broker: { url: "http://127.0.0.1:1", apiKey: "test-broker-key" },
    beatmapService: {
        url: "http://127.0.0.1:1",
        key: "test-beatmap-key",
        bulkKey: "test-beatmap-bulk-key",
    },
    variants: { liveDroid: "live-droid", liveOsu: "live-osu" },
    replayDirectories: {
        unprocessed: "/nonexistent/unprocessed",
        online: "/nonexistent/online",
        best: "/nonexistent/best",
        uncalculated: "/nonexistent/uncalculated",
    },
    discordMetadata: { url: "http://127.0.0.1:1/update", key: "test-key" },
    replayConcurrency: 2,
    uncalculatedConcurrency: 1,
    uncalculatedIntervalMinutes: 10,
    danCourseRefreshMinutes: 60,
};
