import { instanceKey } from "@/registry/snapshot";
import type { Instance } from "@/registry/types";
import { InstanceSelector } from "@/services/InstanceSelector";
import { testSnapshot } from "@test/utils/registry";
import { describe, expect, it } from "vitest";

const urls = ["http://127.0.0.1:1", "http://127.0.0.1:2", "http://127.0.0.1:3"];
const snapshot = testSnapshot({
    variants: [
        { name: "a", public: true, description: null },
        { name: "b", public: true, description: null },
    ],
    instances: [
        ...urls.map((url) => ({ variantName: "a", url })),
        { variantName: "b", url: urls[0] ?? "" },
    ],
});
const variantA = snapshot.variants.get("a");
const variantB = snapshot.variants.get("b");

function selectorWith(healthy: readonly Instance[]) {
    const keys = new Set(healthy.map(instanceKey));

    return new InstanceSelector({
        isHealthy: (instance) => keys.has(instanceKey(instance)),
    });
}

describe("InstanceSelector", () => {
    if (!variantA || !variantB) {
        throw new Error("test snapshot is missing variants");
    }

    const [first, second, third] = variantA.instances;

    if (!first || !second || !third) {
        throw new Error("test snapshot is missing instances");
    }

    it("rotates through healthy instances", () => {
        const selector = selectorWith([first, second, third]);

        expect([1, 2, 3, 4].map(() => selector.select(variantA)?.url)).toEqual([
            first.url,
            second.url,
            third.url,
            first.url,
        ]);
    });

    it("skips unhealthy and excluded instances", () => {
        const selector = selectorWith([first, third]);

        expect(selector.select(variantA, first)?.url).toBe(third.url);
        expect(selector.select(variantA, first)?.url).toBe(third.url);
    });

    it("skips every excluded instance", () => {
        const selector = selectorWith([first, second, third]);

        expect(selector.select(variantA, first, third)?.url).toBe(second.url);
        expect(selector.select(variantA, first, second, third)).toBeUndefined();
    });

    it("returns nothing when no instance is healthy", () => {
        expect(selectorWith([]).select(variantA)).toBeUndefined();
        expect(selectorWith([first]).select(variantA, first)).toBeUndefined();
    });

    it("keeps a separate rotation per variant", () => {
        const [onlyB] = variantB.instances;

        if (!onlyB) {
            throw new Error("test snapshot is missing instances");
        }

        const selector = selectorWith([first, second, onlyB]);

        expect(selector.select(variantA)?.url).toBe(first.url);
        expect(selector.select(variantB)?.url).toBe(onlyB.url);
        expect(selector.select(variantA)?.url).toBe(second.url);
    });
});
