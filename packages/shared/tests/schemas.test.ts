import { describe, expect, it } from "vitest";
import {
    brokerErrorCodes,
    difficultyRequestSchema,
    errorCodes,
    performanceRequestSchema,
    processorErrorCodes,
    replayPerformanceRequestSchema,
    scoreParametersSchema,
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

    it("rejects negative or fractional hit counts", () => {
        for (const score of [{ n300: -1 }, { n100: 1.5 }]) {
            expect(
                performanceRequestSchema.safeParse({
                    beatmap: { id: 1 },
                    score,
                }).success,
            ).toBe(false);
        }
    });

    // The tap penalty is a divisor of at least 1; the slider cheese penalty is a multiplier in (0, 1].
    it.each([
        [{ tapPenalty: 0.5 }, false],
        [{ tapPenalty: 0 }, false],
        [{ tapPenalty: 1 }, true],
        [{ tapPenalty: 1.5 }, true],
        [{ sliderCheesePenalty: 0 }, false],
        [{ sliderCheesePenalty: 1.5 }, false],
        [{ sliderCheesePenalty: 0.5 }, true],
        [{ sliderCheesePenalty: 1 }, true],
    ])("validates penalties %j: %s", (score, valid) => {
        expect(
            performanceRequestSchema.safeParse({ beatmap: { id: 1 }, score })
                .success,
        ).toBe(valid);
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

describe("error codes", () => {
    it("lists the processor codes, then the broker codes", () => {
        expect(processorErrorCodes).toEqual([
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
        expect(brokerErrorCodes).toEqual([
            "VARIANT_NOT_FOUND",
            "RATE_LIMITED",
            "VARIANT_UNAVAILABLE",
            "PROCESSOR_ERROR",
            "PROCESSOR_TIMEOUT",
        ]);
        expect(errorCodes).toEqual([
            ...processorErrorCodes,
            ...brokerErrorCodes,
        ]);
    });
});

const hits = {
    sliderHeadHits: 10,
    sliderTickHits: 20,
    sliderRepeatHits: 3,
    sliderEndHits: 9,
};

describe("scoreParametersSchema slider hits", () => {
    it("accepts all four hit counts", () => {
        expect(scoreParametersSchema.parse(hits)).toEqual(hits);
    });

    it("accepts none of them", () => {
        expect(scoreParametersSchema.parse({ nmiss: 1 })).toEqual({ nmiss: 1 });
    });

    it.each(Object.keys(hits))("rejects a set missing %s", (missing) => {
        const partial: Record<string, number> = { ...hits };
        delete partial[missing];

        const result = scoreParametersSchema.safeParse(partial);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "sliderHeadHits, sliderTickHits, sliderRepeatHits, and sliderEndHits must be given together",
        );
    });

    it.each(["sliderTicksMissed", "sliderEndsDropped"])(
        "rejects hit counts combined with %s",
        (field) => {
            const result = scoreParametersSchema.safeParse({
                ...hits,
                [field]: 0,
            });

            expect(result.success).toBe(false);
            expect(result.error?.issues[0]?.message).toBe(
                "Slider hit counts cannot be combined with sliderTicksMissed or sliderEndsDropped",
            );
        },
    );

    it("rejects negative and fractional hit counts", () => {
        expect(
            scoreParametersSchema.safeParse({ ...hits, sliderTickHits: -1 })
                .success,
        ).toBe(false);
        expect(
            scoreParametersSchema.safeParse({ ...hits, sliderEndHits: 1.5 })
                .success,
        ).toBe(false);
    });

    it("still defaults score to {} in a performance request", () => {
        const parsed = performanceRequestSchema.parse({
            beatmap: { id: 1 },
        });

        expect(parsed.score).toEqual({});
    });
});
