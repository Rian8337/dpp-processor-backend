import { calculateUserTotals } from "@/services/userTotals";
import { describe, expect, it } from "vitest";

describe("calculateUserTotals", () => {
    it("weights by 0.95^i", () => {
        const totals = calculateUserTotals([
            { pp: 100, accuracy: 1 },
            { pp: 50, accuracy: 0.5 },
        ]);

        // Weights are 0.95^0 = 1 and 0.95^1 = 0.95, so they add up to 1.95.
        const weights = 1 + 0.95;

        expect(totals.pp).toBeCloseTo(100 * 1 + 50 * 0.95);
        expect(totals.accuracy).toBeCloseTo((1 * 1 + 0.5 * 0.95) / weights);
    });

    it("gives 0 pp and accuracy 1 without scores", () => {
        expect(calculateUserTotals([])).toEqual({ pp: 0, accuracy: 1 });
    });

    it("uses the first 100 scores only", () => {
        const scores = Array.from({ length: 150 }, () => ({
            pp: 1,
            accuracy: 1,
        }));
        const expected = Array.from(
            { length: 100 },
            (_, i) => 0.95 ** i,
        ).reduce((a, b) => a + b);

        expect(calculateUserTotals(scores).pp).toBeCloseTo(expected);
    });
});
