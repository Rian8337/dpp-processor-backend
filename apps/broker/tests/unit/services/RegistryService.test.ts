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
        { name: "droid-live", public: true, description: null },
        { name: "flowaim", public: false, description: null },
        { name: "secret", public: false, description: null },
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
        },
        {
            id: 2,
            name: "admin",
            keyHash: hashApiKey("admin-key"),
            rateLimitPerMinute: 100,
            allVariants: true,
        },
    ],
    grants: [{ keyId: 1, variantName: "flowaim" }],
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

    it("summarizes the registry", () => {
        expect(service.summary()).toBe(
            "3 variants, 1 instances, 2 aliases, 2 keys",
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
