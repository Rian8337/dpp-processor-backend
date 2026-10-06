import { ConfigError, loadConfig } from "@/config/config";
import { describe, expect, it } from "vitest";

const validEnv = {
    PORT: "3006",
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "dpp_droid_live",
    DATABASE_USER: "dpp",
    DATABASE_PASSWORD: "secret",
    BEATMAP_SERVICE_URL: "http://localhost:3017/api/beatmap/",
    BEATMAP_SERVICE_KEY: "beatmap-key",
    API_KEY: "0123456789abcdef",
    CALCULATION_THREADS: "2",
};

describe("loadConfig", () => {
    it("parses and normalizes valid settings", () => {
        expect(loadConfig(validEnv)).toEqual({
            port: 3006,
            database: {
                host: "localhost",
                port: 5432,
                name: "dpp_droid_live",
                user: "dpp",
                password: "secret",
            },
            beatmapService: {
                url: "http://localhost:3017/api/beatmap",
                key: "beatmap-key",
            },
            apiKey: "0123456789abcdef",
            calculation: { threads: 2, maxQueue: 100 },
        });
    });

    it("allows zero threads", () => {
        expect(
            loadConfig({ ...validEnv, CALCULATION_THREADS: "0" }).calculation
                .threads,
        ).toBe(0);
    });

    it("reports every invalid setting at once, by name, without values", () => {
        const { PORT: _, ...missingPort } = validEnv;
        const load = () =>
            loadConfig({
                ...missingPort,
                API_KEY: "short",
                BEATMAP_SERVICE_URL: "nope",
            });

        expect(load).toThrow(ConfigError);
        expect(load).toThrow(/PORT/);
        expect(load).toThrow(/API_KEY/);
        expect(load).toThrow(/BEATMAP_SERVICE_URL/);
        expect(load).not.toThrow(/short/);
    });
});
