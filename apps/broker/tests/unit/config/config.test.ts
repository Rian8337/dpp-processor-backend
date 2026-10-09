import { ConfigError, loadConfig, loadDatabaseConfig } from "@/config/config";
import { describe, expect, it } from "vitest";

const required = {
    PORT: "3100",
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "dpp_broker",
    DATABASE_USER: "dpp",
    PROCESSOR_API_KEY: "processor-key-0123456789",
};

describe("loadConfig", () => {
    it("applies defaults", () => {
        expect(loadConfig(required)).toEqual({
            port: 3100,
            database: {
                host: "localhost",
                port: 5432,
                name: "dpp_broker",
                user: "dpp",
                password: "",
            },
            processor: {
                apiKey: "processor-key-0123456789",
                timeoutSeconds: 30,
            },
            healthCheck: { intervalSeconds: 10, timeoutSeconds: 3 },
            registryReloadIntervalSeconds: 30,
            anonymousRateLimit: 30,
            trustProxy: false,
            usageSummaryIntervalSeconds: 300,
        });
    });

    it("reads every variable", () => {
        const config = loadConfig({
            ...required,
            DATABASE_PORT: "5433",
            DATABASE_PASSWORD: "secret",
            PROCESSOR_TIMEOUT_SECONDS: "60",
            HEALTH_CHECK_INTERVAL_SECONDS: "5",
            HEALTH_CHECK_TIMEOUT_SECONDS: "2",
            REGISTRY_RELOAD_INTERVAL_SECONDS: "15",
            ANON_RATE_LIMIT: "10",
            TRUST_PROXY: "1",
            USAGE_SUMMARY_INTERVAL_SECONDS: "0",
        });

        expect(config).toMatchObject({
            database: { port: 5433, password: "secret" },
            processor: { timeoutSeconds: 60 },
            healthCheck: { intervalSeconds: 5, timeoutSeconds: 2 },
            registryReloadIntervalSeconds: 15,
            anonymousRateLimit: 10,
            trustProxy: 1,
            usageSummaryIntervalSeconds: 0,
        });
    });

    it("accepts ANON_RATE_LIMIT=0, which turns anonymous access off", () => {
        expect(
            loadConfig({ ...required, ANON_RATE_LIMIT: "0" })
                .anonymousRateLimit,
        ).toBe(0);
    });

    it.each([
        ["true", true],
        ["false", false],
        ["2", 2],
        ["loopback", "loopback"],
        ["10.0.0.0/8, 127.0.0.1", "10.0.0.0/8, 127.0.0.1"],
    ])("parses TRUST_PROXY=%s", (value, expected) => {
        expect(
            loadConfig({ ...required, TRUST_PROXY: value }).trustProxy,
        ).toEqual(expected);
    });

    it("names every invalid variable without including values", () => {
        const attempt = () =>
            loadConfig({
                ...required,
                PORT: "",
                PROCESSOR_API_KEY: "short-secret",
                HEALTH_CHECK_INTERVAL_SECONDS: "0",
            });

        expect(attempt).toThrow(ConfigError);
        expect(attempt).toThrow(/PORT/);
        expect(attempt).toThrow(
            /PROCESSOR_API_KEY: must be at least 16 characters/,
        );
        expect(attempt).toThrow(/HEALTH_CHECK_INTERVAL_SECONDS/);
        expect(attempt).not.toThrow(/short-secret/);
    });
});

describe("loadDatabaseConfig", () => {
    it("needs only the database variables", () => {
        expect(
            loadDatabaseConfig({
                DATABASE_HOST: "localhost",
                DATABASE_NAME: "dpp_broker",
                DATABASE_USER: "dpp",
            }),
        ).toEqual({
            host: "localhost",
            port: 5432,
            name: "dpp_broker",
            user: "dpp",
            password: "",
        });
    });

    it("rejects missing database variables", () => {
        expect(() => loadDatabaseConfig({})).toThrow(/DATABASE_HOST/);
    });
});
