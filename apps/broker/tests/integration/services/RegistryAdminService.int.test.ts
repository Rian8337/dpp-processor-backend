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
            pinned: false,
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

        it("rejects NUL characters, which Postgres cannot store in text", async () => {
            expect.hasAssertions();
            await expectChangeError(
                service.updateVariant("x", { title: "a\u0000b" }),
                "invalid",
                "Title must not contain NUL characters",
            );
            await expectChangeError(
                service.updateVariant("x", { description: "a\u0000b" }),
                "invalid",
                "Description must not contain NUL characters",
            );
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
            await service.updateVariant("x", { pinned: true });
            await service.updateVariant("x", {});

            expect(await repository.findVariant("x")).toEqual({
                name: "x",
                public: true,
                pinned: true,
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
                pinned: false,
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
                pinned: false,
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
            await service.setRole(7, "owner");

            expect(await service.listUsers()).toEqual([
                { uid: 5, role: "admin", grants: [] },
                { uid: 7, role: "owner", grants: [] },
            ]);
        });
    });

    describe("keys", () => {
        it("refuses locking out the key making the change", async () => {
            expect.hasAssertions();
            await service.createKey({
                name: "board",
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: true,
                grants: [],
            });

            await expectChangeError(
                service.revokeKey("board", "board"),
                "conflict",
                "You cannot revoke the key this request uses",
            );
            await expectChangeError(
                service.updateKey("board", { canActForUsers: false }, "board"),
                "conflict",
                "You cannot stop the key this request uses from acting for users",
            );

            const key = await repository.findKey("board");

            expect(key?.revokedAt).toBeNull();
            expect(key?.canActForUsers).toBe(true);

            // Other changes to the same key, and lockout changes from another key or the CLI, are allowed.
            await service.updateKey(
                "board",
                { rateLimitPerMinute: 60 },
                "board",
            );
            await service.updateKey("board", { canActForUsers: true }, "board");
            await service.updateKey(
                "board",
                { canActForUsers: false },
                "other",
            );
            await service.revokeKey("board");

            expect(
                (await repository.findKey("board"))?.revokedAt,
            ).not.toBeNull();
        });

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

        it("reports a name taken between the check and the insert as a conflict", async () => {
            expect.hasAssertions();

            const input = {
                name: "bot",
                rateLimitPerMinute: null,
                allVariants: false,
                canActForUsers: false,
                grants: [],
            };

            await service.createKey(input);
            // Another writer took the name after the existence check.
            vi.spyOn(repository, "findKey").mockResolvedValueOnce(undefined);

            await expectChangeError(
                service.createKey(input),
                "conflict",
                'A key named "bot" already exists',
            );
        });

        it("accepts only null or a positive 32-bit whole number as a limit", async () => {
            expect.hasAssertions();

            const input = {
                name: "bot",
                rateLimitPerMinute: 10,
                allVariants: false,
                canActForUsers: false,
                grants: [],
            };

            for (const limit of [0, -5, 1.5, Number.NaN, 2147483648]) {
                await expectChangeError(
                    service.createKey({ ...input, rateLimitPerMinute: limit }),
                    "invalid",
                    `Invalid limit "${limit.toString()}": expected a whole number of requests per minute`,
                );
            }

            expect(await repository.findKey("bot")).toBeUndefined();

            await service.createKey({
                ...input,
                rateLimitPerMinute: 2147483647,
            });

            for (const limit of [0, -5, 1.5, Number.NaN, 2147483648]) {
                await expectChangeError(
                    service.updateKey("bot", { rateLimitPerMinute: limit }),
                    "invalid",
                    `Invalid limit "${limit.toString()}": expected a whole number of requests per minute`,
                );
            }

            expect((await repository.findKey("bot"))?.rateLimitPerMinute).toBe(
                2147483647,
            );
            expect(
                await service.updateKey("bot", { rateLimitPerMinute: 1 }),
            ).toMatchObject({ rateLimitPerMinute: 1 });
            expect(
                await service.updateKey("bot", { rateLimitPerMinute: null }),
            ).toMatchObject({ rateLimitPerMinute: null });
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
