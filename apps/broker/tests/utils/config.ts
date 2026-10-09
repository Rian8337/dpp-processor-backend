import type { Config } from "@/config/config";

export const testProcessorApiKey = "test-processor-key-0123456789";

/**
 * Settings for tests: short timeouts, a small anonymous limit, summaries off.
 */
export const testConfig: Config = {
    port: 0,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    processor: { apiKey: testProcessorApiKey, timeoutSeconds: 2 },
    healthCheck: { intervalSeconds: 10, timeoutSeconds: 1 },
    registryReloadIntervalSeconds: 30,
    anonymousRateLimit: 3,
    trustProxy: false,
    usageSummaryIntervalSeconds: 0,
};
