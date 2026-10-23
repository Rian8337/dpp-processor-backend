import { fetchInfo } from "@/clients/fetchInfo";
import { reloadReminder } from "@/cli/output";
import { runCli } from "@/cli/run";
import { hashApiKey } from "@/registry/keys";
import { RegistryRepository } from "@/repositories/RegistryRepository";
import { RegistryAdminService } from "@/services/RegistryAdminService";
import { freePort } from "@dpp/server/testing";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { startStubProcessor } from "@test/utils/stubProcessor";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

describe("broker CLI (integration)", () => {
    let database: TestDatabase;
    let repository: RegistryRepository;

    async function run(...argv: string[]) {
        const info: string[] = [];
        const error: string[] = [];
        const code = await runCli(argv, {
            repository,
            admin: new RegistryAdminService(repository),
            processors: { getInfo: fetchInfo },
            healthCheckTimeoutMs: 1000,
            out: {
                info: (line) => info.push(line),
                error: (line) => error.push(line),
            },
        });

        return { code, info, error, all: [...info, ...error].join("\n") };
    }

    async function expectFailure(argv: string[], message: string | RegExp) {
        const result = await run(...argv);

        expect(result.code).toBe(1);
        expect(result.error.join("\n")).toMatch(message);
    }

    beforeEach(async () => {
        database = await createTestDatabase();
        repository = new RegistryRepository(database.db);
    });

    afterEach(() => database[Symbol.asyncDispose]());

    it("prints usage for unknown commands", async () => {
        const result = await run("variant", "explode");

        expect(result.code).toBe(1);
        expect(result.error.join("\n")).toContain("Usage:");
        expect((await run()).code).toBe(1);
    });

    it("reports unknown options", async () => {
        expect.hasAssertions();
        await expectFailure(
            ["variant", "add", "x", "--nope"],
            /Unknown option '--nope'/,
        );
    });

    describe("variants", () => {
        it("adds, lists, updates, and removes variants", async () => {
            const added = await run(
                "variant",
                "add",
                "droid-live",
                "--public",
                "--description",
                "Live droid",
            );

            expect(added.code).toBe(0);
            expect(added.info).toEqual([
                "Added public variant droid-live.",
                reloadReminder,
            ]);

            await run("variant", "add", "flowaim");
            await run("instance", "add", "flowaim", "--port", "3102");

            expect((await run("variant", "list")).info).toEqual([
                "NAME        TITLE  ACCESS   ALIASES  INSTANCES  DESCRIPTION",
                "droid-live  -      public   -        0          Live droid",
                "flowaim     -      private  -        1          -",
            ]);

            expect(
                (
                    await run(
                        "variant",
                        "update",
                        "droid-live",
                        "--private",
                        "--description",
                        "",
                    )
                ).code,
            ).toBe(0);
            expect(await repository.findVariant("droid-live")).toEqual({
                name: "droid-live",
                public: false,
                pinned: false,
                title: null,
                description: null,
            });

            expect((await run("variant", "remove", "flowaim")).code).toBe(0);
            expect(await repository.findVariant("flowaim")).toBeUndefined();
        });

        it("applies the description rules when adding a variant", async () => {
            expect.hasAssertions();
            await expectFailure(
                [
                    "variant",
                    "add",
                    "droid-live",
                    "--description",
                    "d".repeat(4001),
                ],
                /Description is longer than 4000 characters/,
            );
            expect(await repository.findVariant("droid-live")).toBeUndefined();

            expect(
                (
                    await run(
                        "variant",
                        "add",
                        "droid-live",
                        "--description",
                        "d".repeat(4000),
                    )
                ).code,
            ).toBe(0);
        });

        it("refuses bad names, taken names, and empty or contradictory updates", async () => {
            expect.hasAssertions();
            await run("variant", "add", "droid-live");
            await run("alias", "set", "live-droid", "droid-live");

            await expectFailure(
                ["variant", "add", "Droid"],
                /Invalid name "Droid"/,
            );
            await expectFailure(
                ["variant", "add", "droid-live"],
                /"droid-live" is already a variant/,
            );
            await expectFailure(
                ["variant", "add", "live-droid"],
                /"live-droid" is already an alias of droid-live/,
            );
            await expectFailure(
                ["variant", "update", "droid-live"],
                /Nothing to update/,
            );
            await expectFailure(
                ["variant", "update", "droid-live", "--public", "--private"],
                /only one of --public or --private/,
            );
            await expectFailure(
                ["variant", "update", "missing", "--public"],
                /No variant named "missing"/,
            );
        });

        it("sets a title and a multi-line description from a file", async () => {
            const directory = await mkdtemp(join(tmpdir(), "broker-cli-"));

            try {
                const file = join(directory, "description.txt");

                await writeFile(file, "First line\nSecond line\n");
                await run("variant", "add", "droid-live");

                const result = await run(
                    "variant",
                    "update",
                    "droid-live",
                    "--title",
                    "Live droid",
                    "--description-file",
                    file,
                );

                expect(result.code).toBe(0);
                expect(result.info).toEqual([
                    "Updated variant droid-live.",
                    reloadReminder,
                ]);
                expect(await repository.findVariant("droid-live")).toEqual({
                    name: "droid-live",
                    public: false,
                    pinned: false,
                    title: "Live droid",
                    description: "First line\nSecond line",
                });
                expect((await run("variant", "list")).info[1]).toMatch(
                    /^droid-live\s+Live droid\s+private/,
                );

                await writeFile(file, "Windows\r\n");
                await run(
                    "variant",
                    "update",
                    "droid-live",
                    "--description-file",
                    file,
                );

                expect(
                    (await repository.findVariant("droid-live"))?.description,
                ).toBe("Windows");

                await run("variant", "update", "droid-live", "--title", "");

                expect(
                    (await repository.findVariant("droid-live"))?.title,
                ).toBeNull();

                await expectFailure(
                    [
                        "variant",
                        "update",
                        "droid-live",
                        "--description",
                        "x",
                        "--description-file",
                        file,
                    ],
                    /only one of --description or --description-file/,
                );
                await expectFailure(
                    [
                        "variant",
                        "update",
                        "droid-live",
                        "--description-file",
                        join(directory, "missing.txt"),
                    ],
                    /Cannot read ".*missing\.txt"/,
                );
                await expectFailure(
                    [
                        "variant",
                        "update",
                        "droid-live",
                        "--title",
                        "t".repeat(101),
                    ],
                    /Title is longer than 100 characters/,
                );
            } finally {
                await rm(directory, { recursive: true, force: true });
            }
        });

        it("refuses to remove a variant that aliases point at", async () => {
            expect.hasAssertions();
            await run("variant", "add", "droid-live");
            await run("alias", "set", "live-droid", "droid-live");
            await run("alias", "set", "droid", "droid-live");

            await expectFailure(
                ["variant", "remove", "droid-live"],
                "Variant droid-live still has aliases: droid, live-droid. Remove or repoint them first.",
            );
        });
    });

    describe("instances", () => {
        beforeEach(async () => {
            await run("variant", "add", "droid-live");
        });

        it("adds instances by port or URL and removes them", async () => {
            expect(
                (await run("instance", "add", "droid-live", "--port", "3101"))
                    .info[0],
            ).toBe("Added instance http://127.0.0.1:3101 to droid-live.");
            await run(
                "instance",
                "add",
                "droid-live",
                "--url",
                "http://10.0.0.5:3101/",
            );

            expect(
                (await repository.loadSnapshot()).variants.get("droid-live")
                    ?.instances,
            ).toEqual([
                { variantName: "droid-live", url: "http://10.0.0.5:3101" },
                { variantName: "droid-live", url: "http://127.0.0.1:3101" },
            ]);

            expect(
                (
                    await run(
                        "instance",
                        "remove",
                        "droid-live",
                        "--port",
                        "3101",
                    )
                ).code,
            ).toBe(0);
        });

        it("refuses duplicates, unknown variants, and missing instances", async () => {
            expect.hasAssertions();
            await run("instance", "add", "droid-live", "--port", "3101");

            await expectFailure(
                ["instance", "add", "droid-live", "--port", "3101"],
                /already an instance of droid-live/,
            );
            await expectFailure(
                ["instance", "add", "missing", "--port", "3101"],
                /No variant named "missing"/,
            );
            await expectFailure(
                ["instance", "remove", "droid-live", "--port", "3999"],
                /not an instance of droid-live/,
            );
            await expectFailure(
                ["instance", "add", "droid-live"],
                /exactly one of --port or --url/,
            );
        });
    });

    describe("aliases", () => {
        beforeEach(async () => {
            await run("variant", "add", "droid-live");
            await run("variant", "add", "droid-next");
        });

        it("creates, repoints, and removes aliases", async () => {
            expect(
                (await run("alias", "set", "live-droid", "droid-live")).info[0],
            ).toBe("Alias live-droid now points at droid-live.");
            expect(
                (await run("alias", "set", "live-droid", "droid-next")).info[0],
            ).toBe("Repointed alias live-droid from droid-live to droid-next.");
            expect(await repository.findAliasTarget("live-droid")).toBe(
                "droid-next",
            );
            expect((await run("alias", "remove", "live-droid")).code).toBe(0);
        });

        it("refuses variant names, unknown variants, and unknown aliases", async () => {
            expect.hasAssertions();
            await expectFailure(
                ["alias", "set", "droid-next", "droid-live"],
                /"droid-next" is already a variant/,
            );
            await expectFailure(
                ["alias", "set", "x", "missing"],
                /No variant named "missing"/,
            );
            await expectFailure(["alias", "remove", "x"], /No alias named "x"/);
        });
    });

    describe("keys", () => {
        beforeEach(async () => {
            await run("variant", "add", "droid-live", "--public");
            await run("variant", "add", "flowaim");
        });

        it("creates a key, prints it once, and stores only its hash", async () => {
            const result = await run(
                "key",
                "create",
                "bot",
                "--unlimited",
                "--grant",
                "flowaim",
            );
            const key = /^Key: (\S+)$/m.exec(result.info.join("\n"))?.[1] ?? "";

            expect(result.code).toBe(0);
            expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(result.info).toContain(
                "Store it now; it cannot be shown again.",
            );

            const snapshot = await repository.loadSnapshot();

            expect(snapshot.keysByHash.get(hashApiKey(key))).toMatchObject({
                name: "bot",
                rateLimitPerMinute: null,
                grants: new Set(["flowaim"]),
            });
            expect((await run("key", "show", "bot")).all).not.toContain(key);
        });

        it("refuses keys without a limit choice and contradictory options", async () => {
            expect.hasAssertions();
            await expectFailure(
                ["key", "create", "bot"],
                /Pass --limit <per-minute> or --unlimited/,
            );
            await expectFailure(
                ["key", "create", "bot", "--limit", "10", "--unlimited"],
                /only one of --limit or --unlimited/,
            );
            await expectFailure(
                [
                    "key",
                    "create",
                    "bot",
                    "--unlimited",
                    "--all-variants",
                    "--grant",
                    "flowaim",
                ],
                /do not combine it with --grant/,
            );
            await expectFailure(
                ["key", "create", "bot", "--unlimited", "--grant", "missing"],
                /No variant named "missing"/,
            );

            await run("key", "create", "bot", "--limit", "10");

            await expectFailure(
                ["key", "create", "bot", "--limit", "10"],
                /A key named "bot" already exists/,
            );
        });

        it("updates, grants, ungrants, lists, shows, and revokes keys", async () => {
            await run("key", "create", "bot", "--limit", "60");

            expect(
                (
                    await run(
                        "key",
                        "update",
                        "bot",
                        "--unlimited",
                        "--all-variants",
                    )
                ).code,
            ).toBe(0);
            expect(
                (await run("key", "update", "bot", "--granted-only")).code,
            ).toBe(0);
            expect((await run("key", "grant", "bot", "flowaim")).info[0]).toBe(
                "Granted key bot access to flowaim.",
            );
            expect((await run("key", "grant", "bot", "flowaim")).info[0]).toBe(
                "Key bot already has access to flowaim.",
            );

            expect((await run("key", "show", "bot")).info).toEqual([
                "Name:     bot",
                "Limit:    unlimited",
                "Access:   public variants, flowaim",
                expect.stringMatching(/^Created:  \d{4}-\d{2}-\d{2}T/),
                "Revoked:  -",
                "Act for users: no",
            ]);

            expect((await run("key", "ungrant", "bot", "flowaim")).code).toBe(
                0,
            );
            await expectFailure(
                ["key", "ungrant", "bot", "flowaim"],
                /Key bot has no grant for flowaim/,
            );

            expect((await run("key", "revoke", "bot")).info[0]).toBe(
                "Revoked key bot.",
            );
            await expectFailure(
                ["key", "revoke", "bot"],
                /Key bot is already revoked/,
            );
            await expectFailure(
                ["key", "update", "bot", "--limit", "5"],
                /Key bot is revoked/,
            );
            await expectFailure(
                ["key", "update", "missing", "--limit", "5"],
                /No key named "missing"/,
            );

            const list = await run("key", "list");

            expect(list.info[0]).toMatch(
                /^NAME\s+LIMIT\s+ACCESS\s+ACT FOR USERS\s+CREATED\s+REVOKED$/,
            );
            expect(list.info[1]).toMatch(
                /^bot\s+unlimited\s+public variants\s+no\s+\S+\s+\d{4}-/,
            );
        });

        it("lets a key act for users", async () => {
            expect.hasAssertions();
            await run("key", "create", "bot", "--unlimited", "--act-for-users");

            expect((await run("key", "show", "bot")).info).toContain(
                "Act for users: yes",
            );
            expect((await run("key", "list")).info[1]).toMatch(
                /^bot\s+unlimited\s+public variants\s+yes\s/,
            );

            await run("key", "update", "bot", "--no-act-for-users");

            expect((await repository.findKey("bot"))?.canActForUsers).toBe(
                false,
            );

            await run("key", "update", "bot", "--act-for-users");

            expect((await repository.findKey("bot"))?.canActForUsers).toBe(
                true,
            );
            await expectFailure(
                [
                    "key",
                    "update",
                    "bot",
                    "--act-for-users",
                    "--no-act-for-users",
                ],
                /only one of --act-for-users or --no-act-for-users/,
            );
        });

        it("refuses a limit above the database range", async () => {
            expect.hasAssertions();
            await expectFailure(
                ["key", "create", "bot", "--limit", "2147483648"],
                /Invalid limit "2147483648"/,
            );
            expect(
                (await run("key", "create", "bot", "--limit", "2147483647"))
                    .code,
            ).toBe(0);
        });

        it("refuses an update with nothing to change", async () => {
            expect.hasAssertions();
            await run("key", "create", "bot", "--limit", "60");

            await expectFailure(["key", "update", "bot"], /Nothing to update/);
        });
    });

    describe("users", () => {
        beforeEach(async () => {
            await run("variant", "add", "x");
        });

        it("manages user roles and grants", async () => {
            expect((await run("user", "list")).info).toEqual(["No users."]);
            expect((await run("user", "role", "5", "owner")).info).toEqual([
                "Set user 5's role to owner.",
                reloadReminder,
            ]);
            expect((await run("user", "role", "5", "admin")).info).toEqual([
                "Set user 5's role to admin.",
                reloadReminder,
            ]);
            expect((await run("user", "grant", "6", "x")).info).toEqual([
                "Granted user 6 access to x.",
                reloadReminder,
            ]);
            expect((await run("user", "grant", "6", "x")).info[0]).toBe(
                "User 6 already has access to x.",
            );
            expect((await run("user", "list")).info).toEqual([
                "UID  ROLE   GRANTS",
                "5    admin  -",
                "6    -      x",
            ]);

            expect((await run("user", "role", "5", "none")).info[0]).toBe(
                "Removed user 5's role.",
            );
            expect((await run("user", "ungrant", "6", "x")).info[0]).toBe(
                "Removed user 6's access to x.",
            );
            expect((await run("user", "list")).info).toEqual(["No users."]);
            await expectFailure(
                ["user", "ungrant", "6", "x"],
                /User 6 has no grant for x/,
            );
            await expectFailure(
                ["user", "grant", "6", "missing"],
                /No variant named "missing"/,
            );
        });

        it("rejects an invalid role or uid", async () => {
            expect.hasAssertions();
            await expectFailure(
                ["user", "role", "5", "root"],
                /Invalid role "root": expected owner, admin, manager, or none/,
            );

            for (const uid of ["abc", "0", "1.5", "2147483648"]) {
                await expectFailure(
                    ["user", "role", uid, "admin"],
                    `Invalid uid "${uid}"`,
                );
            }

            await expectFailure(["user", "grant", "abc", "x"], /Invalid uid/);
            await expectFailure(["user", "role", "5"], /Expected <uid> <role>/);
            expect((await run("user", "list")).info).toEqual(["No users."]);
        });
    });

    describe("status", () => {
        it("checks every instance and reports its state", async () => {
            await using live = await startStubProcessor("droid-live");
            await using wrong = await startStubProcessor("someone-else");
            const deadPort = await freePort();

            await run("variant", "add", "droid-live", "--public");
            await run("variant", "add", "empty");
            await run("alias", "set", "live-droid", "droid-live");
            await run("instance", "add", "droid-live", "--url", live.url);
            await run("instance", "add", "droid-live", "--url", wrong.url);
            await run(
                "instance",
                "add",
                "droid-live",
                "--port",
                deadPort.toString(),
            );

            const result = await run("status");
            const rows = result.info
                .slice(1)
                .map((line) => line.split(/\s{2,}/));

            expect(result.code).toBe(0);
            expect(result.info[0]).toMatch(
                /^VARIANT\s+ALIASES\s+ACCESS\s+INSTANCE\s+STATE\s+MODE\s+ALGORITHM\s+CALCULATOR$/,
            );
            expect(rows).toContainEqual([
                "droid-live",
                "live-droid",
                "public",
                live.url,
                "healthy",
                "droid",
                "live",
                "0123456789abcdef",
            ]);
            expect(rows).toContainEqual([
                "droid-live",
                "live-droid",
                "public",
                wrong.url,
                'mismatch (reports "someone-else")',
                "droid",
                "live",
                "0123456789abcdef",
            ]);
            expect(
                rows.find(
                    (row) =>
                        row[3] === `http://127.0.0.1:${deadPort.toString()}`,
                )?.[4],
            ).toMatch(/^down \(/);
            expect(rows).toContainEqual([
                "empty",
                "-",
                "private",
                "-",
                "no instances",
                "-",
                "-",
                "-",
            ]);
        });

        it("says so when there are no variants", async () => {
            expect((await run("status")).info).toEqual(["No variants."]);
        });
    });
});
