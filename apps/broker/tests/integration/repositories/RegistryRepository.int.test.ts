import { RegistryRepository } from "@/repositories/RegistryRepository";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

const hash = (character: string) => character.repeat(64);

describe("RegistryRepository (integration)", () => {
    let database: TestDatabase;
    let repository: RegistryRepository;

    beforeEach(async () => {
        database = await createTestDatabase();
        repository = new RegistryRepository(database.db);
    });

    afterEach(() => database[Symbol.asyncDispose]());

    async function seed(): Promise<void> {
        await repository.insertVariant({
            name: "droid-live",
            public: true,
            pinned: false,
            title: null,
            description: "Live droid",
        });
        await repository.insertVariant({
            name: "flowaim",
            public: false,
            pinned: false,
            title: null,
            description: null,
        });
        await repository.insertInstance("droid-live", "http://127.0.0.1:3101");
        await repository.insertInstance("flowaim", "http://127.0.0.1:3102");
        await repository.setAlias("live-droid", "droid-live");
        await repository.insertKey({
            name: "bot",
            hash: hash("a"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: false,
            grants: ["flowaim"],
        });
        await repository.insertKey({
            name: "old",
            hash: hash("b"),
            rateLimitPerMinute: 10,
            allVariants: true,
            canActForUsers: false,
            grants: [],
        });
        await repository.revokeKey("old");
    }

    it("loads an empty registry", async () => {
        const snapshot = await repository.loadSnapshot();

        expect(snapshot.variants.size).toBe(0);
        expect(snapshot.keysByHash.size).toBe(0);
    });

    it("loads variants, instances, aliases, and unrevoked keys with grants", async () => {
        await seed();

        const snapshot = await repository.loadSnapshot();

        expect([...snapshot.variants.keys()]).toEqual([
            "droid-live",
            "flowaim",
        ]);
        expect(snapshot.variants.get("droid-live")).toEqual({
            name: "droid-live",
            public: true,
            pinned: false,
            title: null,
            description: "Live droid",
            instances: [
                { variantName: "droid-live", url: "http://127.0.0.1:3101" },
            ],
            aliases: ["live-droid"],
        });
        expect(snapshot.aliases.get("live-droid")).toBe("droid-live");
        expect(snapshot.keysByHash.get(hash("a"))).toMatchObject({
            name: "bot",
            rateLimitPerMinute: null,
            grants: new Set(["flowaim"]),
        });
        expect(snapshot.keysByHash.has(hash("b"))).toBe(false);
    });

    it("finds and updates variants", async () => {
        await seed();
        await repository.updateVariant("flowaim", {
            public: true,
            description: "Flow aim experiment",
        });

        expect(await repository.findVariant("flowaim")).toEqual({
            name: "flowaim",
            public: true,
            pinned: false,
            title: null,
            description: "Flow aim experiment",
        });
        expect(await repository.findVariant("missing")).toBeUndefined();
    });

    it("refuses to delete a variant with aliases, and cascades otherwise", async () => {
        await seed();

        await expect(repository.deleteVariant("droid-live")).rejects.toThrow(
            "Failed query",
        );

        await repository.deleteVariant("flowaim");

        const snapshot = await repository.loadSnapshot();

        expect(snapshot.variants.has("flowaim")).toBe(false);
        expect(snapshot.keysByHash.get(hash("a"))?.grants.size).toBe(0);
        expect(await repository.findKey("bot")).toMatchObject({ grants: [] });
    });

    it("adds and removes instances, reporting duplicates and misses", async () => {
        await seed();

        expect(
            await repository.insertInstance(
                "droid-live",
                "http://127.0.0.1:3101",
            ),
        ).toBe(false);
        expect(
            await repository.insertInstance(
                "droid-live",
                "http://127.0.0.1:3103",
            ),
        ).toBe(true);
        expect(
            await repository.deleteInstance(
                "droid-live",
                "http://127.0.0.1:3101",
            ),
        ).toBe(true);
        expect(
            await repository.deleteInstance(
                "droid-live",
                "http://127.0.0.1:3101",
            ),
        ).toBe(false);

        const snapshot = await repository.loadSnapshot();

        expect(snapshot.variants.get("droid-live")?.instances).toEqual([
            { variantName: "droid-live", url: "http://127.0.0.1:3103" },
        ]);
    });

    it("creates, repoints, finds, and deletes aliases", async () => {
        await seed();
        await repository.setAlias("live-droid", "flowaim");

        expect(await repository.findAliasTarget("live-droid")).toBe("flowaim");
        expect(await repository.aliasesOf("flowaim")).toEqual(["live-droid"]);
        expect(await repository.aliasesOf("droid-live")).toEqual([]);
        expect(await repository.deleteAlias("live-droid")).toBe(true);
        expect(await repository.deleteAlias("live-droid")).toBe(false);
        expect(await repository.findAliasTarget("live-droid")).toBeUndefined();
    });

    it("lists keys, including revoked ones, sorted by name", async () => {
        await seed();

        const keys = await repository.listKeys();

        expect(keys.map((key) => key.name)).toEqual(["bot", "old"]);
        expect(keys[0]).toMatchObject({
            rateLimitPerMinute: null,
            allVariants: false,
            grants: ["flowaim"],
            revokedAt: null,
        });
        expect(keys[0]?.createdAt).toBeInstanceOf(Date);
        expect(keys[1]?.revokedAt).toBeInstanceOf(Date);
        expect(await repository.findKey("missing")).toBeUndefined();
    });

    it("updates keys and their grants", async () => {
        await seed();
        await repository.updateKey("bot", {
            rateLimitPerMinute: 120,
            allVariants: true,
        });

        expect(await repository.grant("bot", "droid-live")).toBe(true);
        expect(await repository.grant("bot", "droid-live")).toBe(false);
        expect(await repository.ungrant("bot", "flowaim")).toBe(true);
        expect(await repository.ungrant("bot", "flowaim")).toBe(false);
        expect(await repository.findKey("bot")).toMatchObject({
            rateLimitPerMinute: 120,
            allVariants: true,
            grants: ["droid-live"],
        });
    });

    it("revokes a key once", async () => {
        await seed();

        expect(await repository.revokeKey("bot")).toBe(true);
        expect(await repository.revokeKey("bot")).toBe(false);
        expect((await repository.loadSnapshot()).keysByHash.size).toBe(0);
    });

    it("stores and loads a variant title", async () => {
        await seed();
        await repository.insertVariant({
            name: "titled",
            public: true,
            pinned: false,
            title: "Titled variant",
            description: null,
        });
        await repository.updateVariant("flowaim", { title: "Flow aim" });

        const snapshot = await repository.loadSnapshot();

        expect(snapshot.variants.get("titled")?.title).toBe("Titled variant");
        expect(snapshot.variants.get("flowaim")?.title).toBe("Flow aim");
        expect(snapshot.variants.get("droid-live")?.title).toBeNull();
        expect((await repository.findVariant("titled"))?.title).toBe(
            "Titled variant",
        );

        await repository.updateVariant("titled", { title: null });

        expect((await repository.findVariant("titled"))?.title).toBeNull();
    });

    it("loads can_act_for_users for keys", async () => {
        await seed();
        await repository.insertKey({
            name: "acting",
            hash: hash("c"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: true,
            grants: [],
        });

        let snapshot = await repository.loadSnapshot();

        expect(snapshot.keysByHash.get(hash("c"))?.canActForUsers).toBe(true);
        expect(snapshot.keysByHash.get(hash("a"))?.canActForUsers).toBe(false);
        expect(await repository.findKey("acting")).toMatchObject({
            canActForUsers: true,
        });

        await repository.updateKey("acting", { canActForUsers: false });

        snapshot = await repository.loadSnapshot();

        expect(snapshot.keysByHash.get(hash("c"))?.canActForUsers).toBe(false);
    });

    it("grants a user a variant once", async () => {
        await seed();

        expect(await repository.grantUser(1001, "flowaim")).toBe(true);
        expect(await repository.grantUser(1001, "flowaim")).toBe(false);

        const snapshot = await repository.loadSnapshot();

        expect(snapshot.users.get(1001)).toEqual({
            uid: 1001,
            role: null,
            grants: new Set(["flowaim"]),
        });
        expect(await repository.ungrantUser(1001, "flowaim")).toBe(true);
        expect(await repository.ungrantUser(1001, "flowaim")).toBe(false);
    });

    it("does not create a user when granting a missing variant", async () => {
        await expect(repository.grantUser(1001, "missing")).rejects.toThrow(
            "Failed query",
        );
        expect(await repository.findUser(1001)).toBeUndefined();
    });

    it("sets, changes, and clears a role", async () => {
        await repository.setUserRole(1001, "manager");

        expect((await repository.loadSnapshot()).users.get(1001)).toEqual({
            uid: 1001,
            role: "manager",
            grants: new Set(),
        });

        await repository.setUserRole(1001, "admin");

        expect((await repository.findUser(1001))?.role).toBe("admin");

        await repository.setUserRole(1001, null);

        expect((await repository.findUser(1001))?.role).toBeNull();
    });

    it("lists only users with a role or a grant", async () => {
        await seed();
        await repository.grantUser(3, "flowaim");
        await repository.grantUser(3, "droid-live");
        await repository.setUserRole(1, "admin");
        await repository.setUserRole(2, "manager");
        await repository.setUserRole(2, null);
        // Gets a user row with no role and no grants.
        await repository.grantUser(4, "flowaim");
        await repository.ungrantUser(4, "flowaim");

        expect(await repository.listUsers()).toEqual([
            { uid: 1, role: "admin", grants: [] },
            { uid: 3, role: null, grants: ["droid-live", "flowaim"] },
        ]);
        expect(await repository.findUser(3)).toEqual({
            uid: 3,
            role: null,
            grants: ["droid-live", "flowaim"],
        });
        expect(await repository.findUser(999)).toBeUndefined();
    });

    it("deletes user grants with the variant", async () => {
        await seed();
        await repository.grantUser(1001, "flowaim");
        await repository.grantUser(1001, "droid-live");
        await repository.deleteVariant("flowaim");

        expect(
            (await repository.loadSnapshot()).users.get(1001)?.grants,
        ).toEqual(new Set(["droid-live"]));
        expect(await repository.findUser(1001)).toEqual({
            uid: 1001,
            role: null,
            grants: ["droid-live"],
        });
    });

    it("lists the uids granted a variant", async () => {
        await seed();
        await repository.grantUser(30, "flowaim");
        await repository.grantUser(4, "flowaim");
        await repository.grantUser(5, "droid-live");

        expect(await repository.usersGranted("flowaim")).toEqual([4, 30]);
        expect(await repository.usersGranted("droid-live")).toEqual([5]);
        expect(await repository.usersGranted("missing")).toEqual([]);
    });
});
