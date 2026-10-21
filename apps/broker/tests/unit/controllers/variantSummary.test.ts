import { toVariantSummary } from "@/controllers/variantSummary";
import { instanceKey } from "@/registry/snapshot";
import type { Instance } from "@/registry/types";
import type { InfoResponse } from "@dpp/shared";
import { testInfo, testSnapshot } from "@test/utils/registry";
import { describe, expect, it } from "vitest";

const snapshot = testSnapshot({
    variants: [
        {
            name: "a",
            public: true,
            pinned: false,
            title: null,
            description: null,
        },
    ],
    instances: [1, 2, 3].map((port) => ({
        variantName: "a",
        url: `http://127.0.0.1:${port}`,
    })),
});
const variant = snapshot.variants.get("a");

function infoBuiltAt(builtAt: string): InfoResponse {
    return { ...testInfo("a"), builtAt };
}

function healthWith(
    healthy: readonly Instance[],
    options: {
        readonly infos?: ReadonlyMap<string, InfoResponse>;
        readonly lastInfo?: InfoResponse;
    } = {},
) {
    const keys = new Set(healthy.map(instanceKey));

    return {
        isHealthy: (instance: Instance) => keys.has(instanceKey(instance)),
        lastInfo: () => options.lastInfo,
        infoOf: (instance: Instance) =>
            options.infos?.get(instanceKey(instance)),
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

    describe("builtAt", () => {
        const infos = new Map([
            [instanceKey(first), infoBuiltAt("2026-10-01T00:00:00.000Z")],
            [instanceKey(second), infoBuiltAt("2026-10-10T00:00:00.000Z")],
        ]);
        const lastInfo = infoBuiltAt("2026-09-01T00:00:00.000Z");

        it("reports the newest build among healthy instances", () => {
            const health = healthWith([first, second], { infos, lastInfo });

            expect(toVariantSummary(variant, health).builtAt).toBe(
                "2026-10-10T00:00:00.000Z",
            );
        });

        it("ignores builds of instances that are down", () => {
            const health = healthWith([first], { infos, lastInfo });

            expect(toVariantSummary(variant, health).builtAt).toBe(
                "2026-10-01T00:00:00.000Z",
            );
        });

        it("keeps the last known build when every instance is down", () => {
            const health = healthWith([], { infos, lastInfo });

            expect(toVariantSummary(variant, health).builtAt).toBe(
                "2026-09-01T00:00:00.000Z",
            );
        });

        it("reports no build when nothing is known", () => {
            expect(
                toVariantSummary(variant, healthWith([])).builtAt,
            ).toBeNull();
        });
    });

    it("says whether the variant is public", () => {
        expect(
            toVariantSummary({ ...variant, public: false }, healthWith([]))
                .public,
        ).toBe(false);
        expect(toVariantSummary(variant, healthWith([])).public).toBe(true);
    });

    it("says whether the variant is pinned", () => {
        expect(
            toVariantSummary({ ...variant, pinned: true }, healthWith([]))
                .pinned,
        ).toBe(true);
        expect(toVariantSummary(variant, healthWith([])).pinned).toBe(false);
    });
});
