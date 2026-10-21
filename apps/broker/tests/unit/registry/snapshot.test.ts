import {
    anonymousCaller,
    callerName,
    emptySnapshot,
    instanceKey,
} from "@/registry/snapshot";
import { testSnapshot } from "@test/utils/registry";
import { describe, expect, it } from "vitest";

describe("buildSnapshot", () => {
    const snapshot = testSnapshot({
        variants: [
            {
                name: "osu-live",
                public: true,
                pinned: false,
                title: null,
                description: null,
            },
            {
                name: "droid-live",
                public: true,
                pinned: false,
                title: "Droid Live",
                description: "Live droid",
            },
            {
                name: "flowaim",
                public: false,
                pinned: false,
                title: null,
                description: null,
            },
        ],
        instances: [
            { variantName: "droid-live", url: "http://127.0.0.1:3102" },
            { variantName: "droid-live", url: "http://127.0.0.1:3101" },
        ],
        aliases: [
            { name: "live-droid", variantName: "droid-live" },
            { name: "droid", variantName: "droid-live" },
        ],
        keys: [
            {
                id: 1,
                name: "bot",
                keyHash: "a".repeat(64),
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: true,
            },
        ],
        grants: [
            { keyId: 1, variantName: "flowaim" },
            // A grant of a key that was not loaded (revoked) is ignored.
            { keyId: 2, variantName: "flowaim" },
        ],
        users: [
            { uid: 20, role: null },
            { uid: 10, role: "admin" },
            { uid: 30, role: "manager" },
        ],
        userGrants: [
            { uid: 20, variantName: "flowaim" },
            { uid: 20, variantName: "droid-live" },
            { uid: 10, variantName: "flowaim" },
        ],
    });

    it("sorts variants by name, with sorted instances and aliases", () => {
        expect([...snapshot.variants.keys()]).toEqual([
            "droid-live",
            "flowaim",
            "osu-live",
        ]);
        expect(snapshot.variants.get("droid-live")).toEqual({
            name: "droid-live",
            public: true,
            pinned: false,
            title: "Droid Live",
            description: "Live droid",
            instances: [
                { variantName: "droid-live", url: "http://127.0.0.1:3101" },
                { variantName: "droid-live", url: "http://127.0.0.1:3102" },
            ],
            aliases: ["droid", "live-droid"],
        });
    });

    it("maps aliases to variant names and keys by hash, with their grants", () => {
        expect(snapshot.aliases.get("live-droid")).toBe("droid-live");
        expect(snapshot.keysByHash.get("a".repeat(64))).toEqual({
            id: 1,
            name: "bot",
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: true,
            grants: new Set(["flowaim"]),
        });
        expect(snapshot.keysByHash.size).toBe(1);
    });

    it("builds users with their roles and grants", () => {
        expect([...snapshot.users.keys()]).toEqual([10, 20, 30]);
        expect(snapshot.users.get(10)).toEqual({
            uid: 10,
            role: "admin",
            grants: new Set(["flowaim"]),
        });
        expect(snapshot.users.get(20)).toEqual({
            uid: 20,
            role: null,
            grants: new Set(["flowaim", "droid-live"]),
        });
        expect(snapshot.users.get(30)).toEqual({
            uid: 30,
            role: "manager",
            grants: new Set(),
        });
    });

    it("has an empty snapshot to start from", () => {
        expect(emptySnapshot.variants.size).toBe(0);
        expect(emptySnapshot.aliases.size).toBe(0);
        expect(emptySnapshot.keysByHash.size).toBe(0);
        expect(emptySnapshot.users.size).toBe(0);
    });
});

describe("instanceKey", () => {
    it("distinguishes the same URL under different variants", () => {
        const url = "http://127.0.0.1:3101";

        expect(instanceKey({ variantName: "a", url })).not.toBe(
            instanceKey({ variantName: "b", url }),
        );
        expect(instanceKey({ variantName: "a", url })).toBe(
            instanceKey({ variantName: "a", url }),
        );
    });
});

describe("callerName", () => {
    it("names keys by their name and everyone else anonymous", () => {
        expect(callerName(anonymousCaller)).toBe("anonymous");
        expect(
            callerName({
                kind: "key",
                key: {
                    id: 1,
                    name: "bot",
                    rateLimitPerMinute: 10,
                    allVariants: false,
                    canActForUsers: false,
                    grants: new Set(),
                },
            }),
        ).toBe("bot");
    });
});
