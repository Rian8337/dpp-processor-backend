import { toVariantSummary } from "@/controllers/variantSummary";
import { instanceKey } from "@/registry/snapshot";
import type { Instance } from "@/registry/types";
import { testSnapshot } from "@test/utils/registry";
import { describe, expect, it } from "vitest";

const snapshot = testSnapshot({
    variants: [{ name: "a", public: true, title: null, description: null }],
    instances: [1, 2, 3].map((port) => ({
        variantName: "a",
        url: `http://127.0.0.1:${port}`,
    })),
});
const variant = snapshot.variants.get("a");

function healthWith(healthy: readonly Instance[]) {
    const keys = new Set(healthy.map(instanceKey));

    return {
        isHealthy: (instance: Instance) => keys.has(instanceKey(instance)),
        lastInfo: () => undefined,
    };
}

describe("toVariantSummary", () => {
    if (!variant) {
        throw new Error("test snapshot is missing the variant");
    }

    const [first, second] = variant.instances;

    if (!first || !second) {
        throw new Error("test snapshot is missing instances");
    }

    it("counts only healthy instances", () => {
        const summary = toVariantSummary(variant, healthWith([first, second]));

        expect(summary.healthyInstanceCount).toBe(2);
        expect(summary.available).toBe(true);
    });

    it("reports no healthy instances as unavailable", () => {
        const summary = toVariantSummary(variant, healthWith([]));

        expect(summary.healthyInstanceCount).toBe(0);
        expect(summary.available).toBe(false);
    });
});
