import { AlgorithmInputError } from "@/algorithms/errors";
import {
    resolveScore,
    toCalculationOptions,
    type ScoreLimits,
} from "@/algorithms/score";
import { describe, expect, it } from "vitest";

const limits: ScoreLimits = {
    maxCombo: 800,
    hitCircleCount: 300,
    sliderCount: 190,
    spinnerCount: 10,
    maximumScore: 1_000_000,
};

describe("resolveScore", () => {
    it("defaults to a full combo with every object a 300", () => {
        expect(resolveScore(limits, {})).toEqual({
            n300: 500,
            n100: 0,
            n50: 0,
            nmiss: 0,
            combo: 800,
            tapPenalty: 1,
            sliderCheesePenalty: 1,
        });
    });

    it("fills n300 with the objects not otherwise accounted for", () => {
        expect(
            resolveScore(limits, { n100: 10, n50: 5, nmiss: 2 }),
        ).toMatchObject({
            n300: 483,
            n100: 10,
            n50: 5,
            nmiss: 2,
        });
    });

    it("counts objects missing from explicit hit counts as misses", () => {
        expect(resolveScore(limits, { n300: 400, n100: 20 })).toMatchObject({
            n300: 400,
            n100: 20,
            n50: 0,
            nmiss: 80,
        });
    });

    it("rejects hit counts above the object count", () => {
        expect(() => resolveScore(limits, { n300: 500, n100: 1 })).toThrow(
            AlgorithmInputError,
        );
        expect(() => resolveScore(limits, { n300: 501 })).toThrow(
            expect.objectContaining({ code: "INVALID_REQUEST" }),
        );
    });

    it("clamps combo to the maximum and total score to the maximum score", () => {
        const score = resolveScore(limits, {
            combo: 5000,
            totalScore: 2_000_000,
        });

        expect(score.combo).toBe(800);
        expect(score.totalScore).toBe(1_000_000);
    });

    it("keeps total score unclamped when there is no maximum score", () => {
        const { maximumScore: _, ...osuLimits } = limits;

        expect(
            resolveScore(osuLimits, { totalScore: 2_000_000 }).totalScore,
        ).toBe(2_000_000);
    });

    it("passes through slider values and penalties", () => {
        expect(
            resolveScore(limits, {
                sliderTicksMissed: 3,
                sliderEndsDropped: 4,
                tapPenalty: 1.1,
                sliderCheesePenalty: 0.8,
            }),
        ).toMatchObject({
            sliderTicksMissed: 3,
            sliderEndsDropped: 4,
            tapPenalty: 1.1,
            sliderCheesePenalty: 0.8,
        });
    });
});

describe("toCalculationOptions", () => {
    it("maps a resolved score to calculator options", () => {
        const options = toCalculationOptions(
            resolveScore(limits, { n100: 10, sliderTicksMissed: 2 }),
        );

        expect(options.combo).toBe(800);
        expect(options.sliderTicksMissed).toBe(2);
        expect(options.accPercent).toMatchObject({
            n300: 490,
            n100: 10,
            n50: 0,
            nmiss: 0,
        });
    });
});
