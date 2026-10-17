import { hashApiKey } from "@/registry/keys";
import { RegistryChangeError } from "@/registry/RegistryChangeError";
import { RegistryRepository } from "@/repositories/RegistryRepository";
import { RegistryAdminService } from "@/services/RegistryAdminService";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

describe("RegistryAdminService (integration)", () => {
    let database: TestDatabase;
    let repository: RegistryRepository;
    let service: RegistryAdminService;

    beforeEach(async () => {
        database = await createTestDatabase();
        repository = new RegistryRepository(database.db);
        service = new RegistryAdminService(repository);

        await repository.insertVariant({
            name: "x",
            public: false,
            title: null,
            description: null,
        });
    });

    afterEach(() => database[Symbol.asyncDispose]());

    async function expectChangeError(
        promise: Promise<unknown>,
        kind: RegistryChangeError["kind"],
        message: string,
    ) {
        const error: unknown = await promise.then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(RegistryChangeError);
        expect(error).toMatchObject({ kind, message });
    }

    describe("updateVariant", () => {
        it("rejects titles over 100 characters and descriptions over 4000", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.updateVariant("x", { title: "t".repeat(101) }),
                "invalid",
                "Title is longer than 100 characters",
            );
            await expectChangeError(
                service.updateVariant("x", { description: "d".repeat(4001) }),
                "invalid",
                "Description is longer than 4000 characters",
            );

            await service.updateVariant("x", {
                title: "t".repeat(100),
                description: "d".repeat(4000),
            });

            expect(await repository.findVariant("x")).toMatchObject({
                title: "t".repeat(100),
                description: "d".repeat(4000),
            });
        });

        it("keeps newlines in descriptions", async () => {
            await service.updateVariant("x", {
                description: "line one\nline two\n",
            });

            expect((await repository.findVariant("x"))?.description).toBe(
                "line one\nline two\n",
            );
        });

        it("turns empty text into null and null into a cleared value", async () => {
            await service.updateVariant("x", { title: "T", description: "D" });
            await service.updateVariant("x", { title: "", description: null });

            expect(await repository.findVariant("x")).toMatchObject({
                title: null,
                description: null,
            });
        });

        it("changes only what is given, and accepts no changes", async () => {
            await service.updateVariant("x", { title: "T" });
            await service.updateVariant("x", { public: true });
            await service.updateVariant("x", {});

            expect(await repository.findVariant("x")).toEqual({
                name: "x",
                public: true,
                title: "T",
                description: null,
            });
        });

        it("refuses an unknown variant", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.updateVariant("missing", { public: true }),
                "variant-not-found",
                'No variant named "missing"',
            );
        });
    });

    describe("aliases", () => {
        it("refuses an alias named like a variant", async () => {
            expect.hasAssertions();
            await repository.insertVariant({
                name: "y",
                public: false,
                title: null,
                description: null,
            });

            await expectChangeError(
                service.setAlias("y", "x"),
                "conflict",
                '"y" is already a variant',
            );
        });

        it("refuses invalid alias names, including an empty one", async () => {
            expect.hasAssertions();

            for (const alias of ["", "Bad", "-bad"]) {
                await expectChangeError(
                    service.setAlias(alias, "x"),
                    "invalid",
                    `Invalid name "${alias}": use lowercase letters, digits, and hyphens, not starting with a hyphen`,
                );
            }
        });

        it("reports the previous target when repointing", async () => {
            await repository.insertVariant({
                name: "y",
                public: false,
                title: null,
                description: null,
            });

            expect(await service.setAlias("a", "x")).toEqual({
                previous: undefined,
            });
            expect(await service.setAlias("a", "y")).toEqual({
                previous: "x",
            });
            expect(await repository.findAliasTarget("a")).toBe("y");
        });

        it("refuses an unknown target and removing an unknown alias", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.setAlias("a", "missing"),
                "variant-not-found",
                'No variant named "missing"',
            );
            await expectChangeError(
                service.removeAlias("a"),
                "not-found",
                'No alias named "a"',
            );

            await service.setAlias("a", "x");
            await service.removeAlias("a");

            expect(await repository.findAliasTarget("a")).toBeUndefined();
        });
    });

    describe("users", () => {
        it("grants a user only an existing variant", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.grantUser(5, "missing"),
                "variant-not-found",
                'No variant named "missing"',
            );

            expect(await service.grantUser(5, "x")).toBe(true);
            expect(await service.grantUser(5, "x")).toBe(false);
            expect(await service.usersGranted("x")).toEqual([5]);
            expect(await service.listUsers()).toEqual([
                { uid: 5, role: null, grants: ["x"] },
            ]);
        });

        it("ungrants a user, and refuses a grant they do not have", async () => {
            expect.hasAssertions();
            await service.grantUser(5, "x");
            await service.ungrantUser(5, "x");

            expect(await service.usersGranted("x")).toEqual([]);
            await expectChangeError(
                service.ungrantUser(5, "x"),
                "not-found",
                "User 5 has no grant for x",
            );
        });

        it("lists who is granted a known variant only", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.usersGranted("missing"),
                "variant-not-found",
                'No variant named "missing"',
            );
        });

        it("refuses uids that are not positive 32-bit integers", async () => {
            expect.hasAssertions();

            for (const uid of [0, -1, 1.5, Number.NaN, 2147483648, 2 ** 53]) {
                await expectChangeError(
                    service.setRole(uid, "admin"),
                    "invalid",
                    `Invalid uid "${uid.toString()}"`,
                );
                await expectChangeError(
                    service.grantUser(uid, "x"),
                    "invalid",
                    `Invalid uid "${uid.toString()}"`,
                );
                await expectChangeError(
                    service.ungrantUser(uid, "x"),
                    "invalid",
                    `Invalid uid "${uid.toString()}"`,
                );
            }

            await service.setRole(2147483647, "manager");

            expect(await service.listUsers()).toEqual([
                { uid: 2147483647, role: "manager", grants: [] },
            ]);
        });

        it("sets and clears roles", async () => {
            await service.setRole(5, "admin");
            await service.setRole(6, "manager");
            await service.setRole(6, null);

            expect(await service.listUsers()).toEqual([
                { uid: 5, role: "admin", grants: [] },
            ]);
        });

        it("refuses an admin removing their own admin role", async () => {
            expect.hasAssertions();
            await service.setRole(5, "admin");

            await expectChangeError(
                service.setRole(5, null, 5),
                "conflict",
                "You cannot remove your own admin role",
            );
            await expectChangeError(
                service.setRole(5, "manager", 5),
                "conflict",
                "You cannot remove your own admin role",
            );

            expect((await repository.findUser(5))?.role).toBe("admin");

            await service.setRole(5, "admin", 5);
            await service.setRole(5, null, 6);

            expect((await repository.findUser(5))?.role).toBeNull();
        });
    });

    describe("keys", () => {
        it("creates a key that can act for users and returns the raw key once", async () => {
            const { key, rawKey } = await service.createKey({
                name: "bot",
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: true,
                grants: ["x", "x"],
            });

            expect(rawKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(key).toMatchObject({
                name: "bot",
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: true,
                grants: ["x"],
                revokedAt: null,
            });
            expect(
                (await repository.loadSnapshot()).keysByHash.get(
                    hashApiKey(rawKey),
                ),
            ).toMatchObject({ name: "bot", canActForUsers: true });
            expect(JSON.stringify(await service.listKeys())).not.toContain(
                rawKey,
            );
        });

        it("refuses invalid and taken key names and unknown grants", async () => {
            expect.hasAssertions();

            const input = {
                name: "bot",
                rateLimitPerMinute: 10,
                allVariants: false,
                canActForUsers: false,
                grants: [],
            };

            await expectChangeError(
                service.createKey({ ...input, name: "" }),
                "invalid",
                'Invalid name "": use lowercase letters, digits, and hyphens, not starting with a hyphen',
            );
            await expectChangeError(
                service.createKey({ ...input, grants: ["missing"] }),
                "variant-not-found",
                'No variant named "missing"',
            );

            await service.createKey(input);

            await expectChangeError(
                service.createKey(input),
                "conflict",
                'A key named "bot" already exists',
            );
        });

        it("updates a key and refuses a missing or revoked one", async () => {
            expect.hasAssertions();
            await service.createKey({
                name: "bot",
                rateLimitPerMinute: 10,
                allVariants: false,
                canActForUsers: false,
                grants: [],
            });

            expect(
                await service.updateKey("bot", {
                    rateLimitPerMinute: null,
                    canActForUsers: true,
                }),
            ).toMatchObject({
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: true,
            });
            expect(await service.updateKey("bot", {})).toMatchObject({
                canActForUsers: true,
            });

            await expectChangeError(
                service.updateKey("missing", { allVariants: true }),
                "not-found",
                'No key named "missing"',
            );

            await service.revokeKey("bot");

            await expectChangeError(
                service.updateKey("bot", { allVariants: true }),
                "conflict",
                "Key bot is revoked",
            );
            await expectChangeError(
                service.revokeKey("bot"),
                "conflict",
                "Key bot is already revoked",
            );
            await expectChangeError(
                service.revokeKey("missing"),
                "not-found",
                'No key named "missing"',
            );
        });

        it("grants and ungrants key access", async () => {
            expect.hasAssertions();
            await service.createKey({
                name: "bot",
                rateLimitPerMinute: null,
                allVariants: true,
                canActForUsers: false,
                grants: [],
            });

            expect(await service.grantKey("bot", "x")).toEqual({
                added: true,
                allVariants: true,
            });
            expect(await service.grantKey("bot", "x")).toEqual({
                added: false,
                allVariants: true,
            });
            await expectChangeError(
                service.grantKey("bot", "missing"),
                "variant-not-found",
                'No variant named "missing"',
            );

            await service.ungrantKey("bot", "x");

            await expectChangeError(
                service.ungrantKey("bot", "x"),
                "not-found",
                "Key bot has no grant for x",
            );
        });
    });
});
