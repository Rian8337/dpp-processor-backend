import { effectiveMultiplier, ppMultiplierFrom } from "@/services/ppMultiplier";
import { describe, expect, it } from "vitest";

describe("effectiveMultiplier", () => {
    it.each([
        [null, 1],
        [undefined, 1],
        [0.8, 0.8],
        [1, 1],
        [1.2, 1],
    ])("%s → %s", (stored, expected) => {
        expect(effectiveMultiplier(stored)).toBe(expected);
    });
});

describe("ppMultiplierFrom", () => {
    it("divides pp by the no-penalty total", () => {
        expect(ppMultiplierFrom(80, 100)).toBe(0.8);
    });

    it("is 1 when the no-penalty total is 0", () => {
        expect(ppMultiplierFrom(0, 0)).toBe(1);
    });
});
