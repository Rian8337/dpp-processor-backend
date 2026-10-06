import { describe, expect, it } from "vitest";
import {
    difficultyRequestSchema,
    errorCodes,
    performanceRequestSchema,
    replayPerformanceRequestSchema,
} from "../src";

describe("difficultyRequestSchema", () => {
    it("accepts each beatmap reference form and defaults optional fields", () => {
        for (const beatmap of [
            { id: 1 },
            { hash: "0123456789abcdef0123456789abcdef" },
            { file: "osu file format v14" },
        ]) {
            expect(difficultyRequestSchema.parse({ beatmap })).toEqual({
                beatmap,
                mods: [],
                strainChart: false,
            });
        }
    });

    it("rejects a reference with more than one form", () => {
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1, hash: "0123456789abcdef0123456789abcdef" },
            }).success,
        ).toBe(false);
    });

    it("rejects malformed hashes, non-positive IDs, empty acronyms, and unknown fields", () => {
        expect(
            difficultyRequestSchema.safeParse({ beatmap: { hash: "abc" } })
                .success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({ beatmap: { id: 0 } }).success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1 },
                mods: [{ acronym: "" }],
            }).success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1 },
                gamemode: "droid",
            }).success,
        ).toBe(false);
    });

    it("accepts long acronyms and mods with settings", () => {
        const request = difficultyRequestSchema.parse({
            beatmap: { id: 1 },
            mods: [
                { acronym: "REPLAYV6" },
                { acronym: "DT", settings: { rateMultiplier: 1.3 } },
            ],
        });

        expect(request.mods).toEqual([
            { acronym: "REPLAYV6" },
            { acronym: "DT", settings: { rateMultiplier: 1.3 } },
        ]);
    });
});

describe("performanceRequestSchema", () => {
    it("defaults score to an empty object", () => {
        expect(
            performanceRequestSchema.parse({ beatmap: { id: 1 } }).score,
        ).toEqual({});
    });

    it("rejects negative or fractional hit counts and non-positive penalties", () => {
        for (const score of [{ n300: -1 }, { n100: 1.5 }, { tapPenalty: 0 }]) {
            expect(
                performanceRequestSchema.safeParse({
                    beatmap: { id: 1 },
                    score,
                }).success,
            ).toBe(false);
        }
    });
});

describe("replayPerformanceRequestSchema", () => {
    it("requires base64 replay data", () => {
        expect(
            replayPerformanceRequestSchema.safeParse({ replay: "not base64!" })
                .success,
        ).toBe(false);
        expect(
            replayPerformanceRequestSchema.parse({ replay: "AAEC" }),
        ).toEqual({
            replay: "AAEC",
            strainChart: false,
        });
    });

    it("keeps the mods and score overrides optional, without defaults", () => {
        const request = replayPerformanceRequestSchema.parse({
            replay: "AAEC",
        });

        expect(request.mods).toBeUndefined();
        expect(request.score).toBeUndefined();
    });
});

describe("errorCodes", () => {
    it("lists every code the processor can return", () => {
        expect(errorCodes).toEqual([
            "INVALID_REQUEST",
            "UNAUTHORIZED",
            "BEATMAP_NOT_FOUND",
            "INVALID_BEATMAP",
            "INVALID_REPLAY",
            "BEATMAP_SERVICE_UNAVAILABLE",
            "OVERLOADED",
            "CALCULATION_FAILED",
            "INTERNAL_ERROR",
        ]);
    });
});
