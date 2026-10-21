import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import { hashApiKey } from "@/registry/keys";
import { anonymousCaller } from "@/registry/snapshot";
import type { ApiKeyRecord, Caller, RegistrySnapshot } from "@/registry/types";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import { RegistryService } from "@/services/RegistryService";
import { testConfig } from "@test/utils/config";
import { testSnapshot } from "@test/utils/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = testSnapshot({
    variants: [
        {
            name: "droid-live",
            public: true,
            pinned: false,
            title: null,
            description: null,
        },
        {
            name: "flowaim",
            public: false,
            pinned: false,
            title: null,
            description: null,
        },
        {
            name: "secret",
            public: false,
            pinned: false,
            title: null,
            description: null,
        },
    ],
    instances: [{ variantName: "droid-live", url: "http://127.0.0.1:3101" }],
    aliases: [
        { name: "live-droid", variantName: "droid-live" },
        { name: "experiment", variantName: "flowaim" },
    ],
    keys: [
        {
            id: 1,
            name: "bot",
            keyHash: hashApiKey("bot-key"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: false,
        },
        {
            id: 2,
            name: "admin",
            keyHash: hashApiKey("admin-key"),
            rateLimitPerMinute: 100,
            allVariants: true,
            canActForUsers: false,
        },
        {
            id: 3,
            name: "board",
            keyHash: hashApiKey("board-key"),
            rateLimitPerMinute: null,
            allVariants: true,
            canActForUsers: true,
        },
    ],
    grants: [{ keyId: 1, variantName: "flowaim" }],
    users: [
        { uid: 1001, role: null },
        { uid: 1002, role: "admin" },
        { uid: 1003, role: "manager" },
        { uid: 1004, role: null },
    ],
    userGrants: [{ uid: 1001, variantName: "flowaim" }],
});

describe("RegistryService", () => {
    let loadSnapshot: ReturnType<
        typeof vi.fn<IRegistryRepository["loadSnapshot"]>
    >;
    let sync: ReturnType<typeof vi.fn<IHealthMonitor["sync"]>>;
    let service: RegistryService;

    const keyCaller = (raw: string): Caller => {
        const key: ApiKeyRecord | undefined = service.authenticate(raw);

        if (!key) {
            throw new Error(`no key ${raw}`);
        }

        return { kind: "key", key };
    };

    beforeEach(async () => {
        loadSnapshot = vi.fn<IRegistryRepository["loadSnapshot"]>(() =>
            Promise.resolve(snapshot),
        );
        sync = vi.fn<IHealthMonitor["sync"]>();

        // Only loadSnapshot and sync are used by the service; the other members are never called.
        const repository: Pick<IRegistryRepository, "loadSnapshot"> = {
            loadSnapshot,
        };
        const health: Pick<IHealthMonitor, "sync"> = { sync };

        service = new RegistryService(repository, health, testConfig);
        await service.load();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("hands each loaded snapshot to the health monitor", () => {
        expect(sync).toHaveBeenCalledWith(snapshot);
    });

    it("authenticates known keys by hash", () => {
        expect(service.authenticate("bot-key")?.name).toBe("bot");
        expect(service.authenticate("wrong")).toBeUndefined();
        expect(service.authenticate("")).toBeUndefined();
    });

    it("resolves public variants by name or alias for anyone", () => {
        expect(service.resolve("droid-live", anonymousCaller)?.name).toBe(
            "droid-live",
        );
        expect(service.resolve("live-droid", anonymousCaller)?.name).toBe(
            "droid-live",
        );
        expect(service.resolve("missing", anonymousCaller)).toBeUndefined();
    });

    it("hides private variants, also through aliases, from callers without access", () => {
        expect(service.resolve("flowaim", anonymousCaller)).toBeUndefined();
        expect(service.resolve("experiment", anonymousCaller)).toBeUndefined();
        expect(service.resolve("secret", keyCaller("bot-key"))).toBeUndefined();
    });

    it("lets granted keys and all-variant keys use private variants", () => {
        expect(service.resolve("experiment", keyCaller("bot-key"))?.name).toBe(
            "flowaim",
        );
        expect(service.resolve("secret", keyCaller("admin-key"))?.name).toBe(
            "secret",
        );
    });

    it("lists the variants each caller can see", () => {
        const names = (caller: Caller) =>
            service.visibleVariants(caller).map((variant) => variant.name);

        expect(names(anonymousCaller)).toEqual(["droid-live"]);
        expect(names(keyCaller("bot-key"))).toEqual(["droid-live", "flowaim"]);
        expect(names(keyCaller("admin-key"))).toEqual([
            "droid-live",
            "flowaim",
            "secret",
        ]);
    });

    describe("acting for a person", () => {
        const acting = (uid: number): Caller => {
            const caller = keyCaller("board-key");

            if (caller.kind !== "key") {
                throw new Error("expected a key caller");
            }

            return { ...caller, actingUid: uid };
        };
        const names = (caller: Caller) =>
            service.visibleVariants(caller).map((variant) => variant.name);

        it("uses the acting person's access instead of the key's", () => {
            // The key sees every variant, but a person with no role and no grants only sees public ones.
            expect(names(keyCaller("board-key"))).toEqual([
                "droid-live",
                "flowaim",
                "secret",
            ]);
            expect(names(acting(1004))).toEqual(["droid-live"]);
            expect(service.resolve("flowaim", acting(1004))).toBeUndefined();
            expect(service.resolve("experiment", acting(1004))).toBeUndefined();
        });

        it("lets an acting person use their granted private variants", () => {
            expect(names(acting(1001))).toEqual(["droid-live", "flowaim"]);
            expect(service.resolve("experiment", acting(1001))?.name).toBe(
                "flowaim",
            );
            expect(service.resolve("secret", acting(1001))).toBeUndefined();
        });

        it("lets acting admins and managers see every variant", () => {
            for (const uid of [1002, 1003]) {
                expect(names(acting(uid))).toEqual([
                    "droid-live",
                    "flowaim",
                    "secret",
                ]);
                expect(service.resolve("secret", acting(uid))?.name).toBe(
                    "secret",
                );
            }
        });

        it("treats an unknown acting uid as having no grants", () => {
            expect(names(acting(9999))).toEqual(["droid-live"]);
            expect(service.resolve("flowaim", acting(9999))).toBeUndefined();
        });
    });

    it("finds users by uid", () => {
        expect(service.findUser(1002)).toEqual({
            uid: 1002,
            role: "admin",
            grants: new Set(),
        });
        expect(service.findUser(1001)?.grants).toEqual(new Set(["flowaim"]));
        expect(service.findUser(9999)).toBeUndefined();
    });

    it("lists every variant sorted by name", () => {
        expect(service.allVariants().map((variant) => variant.name)).toEqual([
            "droid-live",
            "flowaim",
            "secret",
        ]);
    });

    it("summarizes the registry", () => {
        expect(service.summary()).toBe(
            "3 variants, 1 instances, 2 aliases, 3 keys",
        );
    });

    it("keeps the previous snapshot when a reload fails", async () => {
        const error = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        loadSnapshot.mockRejectedValueOnce(new Error("connection refused"));

        expect(await service.reload()).toBe(false);
        expect(service.resolve("droid-live", anonymousCaller)).toBeDefined();
        expect(error).toHaveBeenCalledWith(
            "Failed to reload the registry; keeping the previous one:",
            "connection refused",
        );
    });

    it("applies a reloaded snapshot", async () => {
        const empty: RegistrySnapshot = testSnapshot({});

        loadSnapshot.mockResolvedValueOnce(empty);

        expect(await service.reload()).toBe(true);
        expect(service.resolve("droid-live", anonymousCaller)).toBeUndefined();
        expect(sync).toHaveBeenLastCalledWith(empty);
    });

    it("does not let a load that finishes late replace a newer snapshot", async () => {
        const resolvers: ((snapshot: RegistrySnapshot) => void)[] = [];

        loadSnapshot.mockImplementation(
            () => new Promise((resolve) => resolvers.push(resolve)),
        );

        const older = service.load();
        const newer = service.load();
        const empty: RegistrySnapshot = testSnapshot({});

        // The later-started load finishes first, then the earlier one with the old data.
        resolvers[1]?.(empty);
        await newer;
        resolvers[0]?.(snapshot);
        await older;

        expect(service.resolve("droid-live", anonymousCaller)).toBeUndefined();
        expect(sync).toHaveBeenLastCalledWith(empty);
        expect(sync).toHaveBeenCalledTimes(2);
    });

    it("reloads on an interval until disposed", async () => {
        vi.useFakeTimers();

        const timer = service.startReloading();

        await vi.advanceTimersByTimeAsync(
            testConfig.registryReloadIntervalSeconds * 1000,
        );

        expect(loadSnapshot).toHaveBeenCalledTimes(2);

        timer[Symbol.dispose]();
        await vi.advanceTimersByTimeAsync(
            testConfig.registryReloadIntervalSeconds * 3000,
        );

        expect(loadSnapshot).toHaveBeenCalledTimes(2);
    });
});
