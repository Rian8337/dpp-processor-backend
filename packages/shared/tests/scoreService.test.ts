import { ModHidden } from "@rian8337/osu-base";
import { describe, expect, it } from "vitest";
import {
    calculateReplayFieldsSchema,
    calculateScoreFieldsSchema,
    errorCodes,
    onlineScoreQuerySchema,
} from "../src";

const hash = "0123456789abcdef0123456789abcdef";

describe("onlineScoreQuerySchema", () => {
    it("parses a query with defaults", () => {
        expect(
            onlineScoreQuerySchema.parse({
                uid: "42",
                hash,
                variant: "live-droid",
            }),
        ).toEqual({
            uid: 42,
            hash,
            variant: "live-droid",
            best: false,
            strainChart: false,
        });
    });

    it("parses booleans", () => {
        const parsed = onlineScoreQuerySchema.parse({
            uid: "1",
            hash,
            variant: "a",
            best: "true",
            strainChart: "false",
        });

        expect(parsed.best).toBe(true);
        expect(parsed.strainChart).toBe(false);
    });

    it.each([
        [{ uid: "0" }],
        [{ uid: "1.5" }],
        [{ uid: "abc" }],
        [{ hash: hash.toUpperCase() }],
        [{ hash: "abc" }],
        [{ variant: "Live" }],
        [{ variant: "-live" }],
        [{ best: "yes" }],
        [{ strainChart: "1" }],
    ])("rejects %j", (override) => {
        expect(
            onlineScoreQuerySchema.safeParse({
                uid: "1",
                hash,
                variant: "live",
                ...override,
            }).success,
        ).toBe(false);
    });
});

describe("calculateScoreFieldsSchema", () => {
    const fields = {
        hash: hash.toUpperCase(),
        mods: JSON.stringify([new ModHidden().serialize()]),
        combo: "100",
        perfect: "90",
        good: "5",
        bad: "1",
        miss: "2",
        total_score: "1000000",
    };

    it("parses form fields (strings) with defaults", () => {
        expect(calculateScoreFieldsSchema.parse(fields)).toEqual({
            hash,
            mods: [new ModHidden().serialize()],
            combo: 100,
            perfect: 90,
            good: 5,
            bad: 1,
            miss: 2,
            totalScore: 1000000,
            sliderHits: null,
            ppMultiplier: 1,
        });
    });

    it("parses JSON numbers, slider hits, a multiplier, and a variant", () => {
        expect(
            calculateScoreFieldsSchema.parse({
                ...fields,
                combo: 100,
                slider_head_hit: "10",
                slider_tick_hit: 20,
                slider_repeat_hit: "0",
                slider_end_hit: "9",
                pp_multiplier: "0.5",
                variant: "droid-test",
            }),
        ).toMatchObject({
            combo: 100,
            sliderHits: { head: 10, tick: 20, repeat: 0, end: 9 },
            ppMultiplier: 0.5,
            variant: "droid-test",
        });
    });

    it.each([
        ["a missing hash", { hash: undefined }],
        ["a short hash", { hash: "abc" }],
        ["mods that are not JSON", { mods: "HD" }],
        [
            "mods of the wrong shape",
            { mods: JSON.stringify(new ModHidden().serialize()) },
        ],
        ["a negative count", { miss: "-1" }],
        ["a fractional count", { combo: "1.5" }],
        ["an empty count", { good: "" }],
        ["a partial slider hit set", { slider_head_hit: "1" }],
        ["a zero multiplier", { pp_multiplier: "0" }],
        ["a multiplier above 1", { pp_multiplier: "1.01" }],
        ["a non-numeric multiplier", { pp_multiplier: "x" }],
        ["an invalid variant", { variant: "Bad Name" }],
    ])("rejects %s", (_name, override) => {
        expect(
            calculateScoreFieldsSchema.safeParse({ ...fields, ...override })
                .success,
        ).toBe(false);
    });
});

describe("calculateReplayFieldsSchema", () => {
    it("accepts no fields or a variant", () => {
        expect(calculateReplayFieldsSchema.parse({})).toEqual({});
        expect(calculateReplayFieldsSchema.parse({ variant: "x" })).toEqual({
            variant: "x",
        });
    });
});

describe("errorCodes", () => {
    it("includes the score service's codes", () => {
        expect(errorCodes).toContain("SCORE_NOT_FOUND");
        expect(errorCodes).toContain("BROKER_UNAVAILABLE");
    });
});
