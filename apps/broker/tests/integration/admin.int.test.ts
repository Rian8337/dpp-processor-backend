import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import { hashApiKey } from "@/registry/keys";
import { RegistryRepository } from "@/repositories/RegistryRepository";
import { createTestContainer, type TestContainer } from "@test/utils/container";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

const admin = 1;
const manager = 2;
const plain = 3;

describe("admin and me routes (integration)", () => {
    let database: TestDatabase;
    let testContainer: TestContainer;
    let repository: RegistryRepository;
    let app: ReturnType<typeof createApp>;

    beforeEach(async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        database = await createTestDatabase();
        repository = new RegistryRepository(database.db);

        await repository.insertVariant({
            name: "droid-live",
            public: true,
            title: null,
            description: "Live",
        });
        await repository.insertVariant({
            name: "flowaim",
            public: false,
            title: null,
            description: null,
        });
        await repository.insertInstance("flowaim", "http://127.0.0.1:1");
        await repository.setAlias("experiment", "flowaim");
        await repository.insertKey({
            name: "board",
            hash: hashApiKey("board-key"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: true,
            grants: [],
        });
        await repository.insertKey({
            name: "plain",
            hash: hashApiKey("plain-key"),
            rateLimitPerMinute: null,
            allVariants: true,
            canActForUsers: false,
            grants: [],
        });
        await repository.setUserRole(admin, "admin");
        await repository.setUserRole(manager, "manager");
        await repository.grantUser(manager, "flowaim");

        testContainer = await createTestContainer({ db: database.db });
        await testContainer.container
            .resolve(dependencyTokens.registryService)
            .load();
        app = createApp(testContainer.container);
    });

    afterEach(async () => {
        await testContainer[Symbol.asyncDispose]();
        await database[Symbol.asyncDispose]();
    });

    /** A request made with the board key on behalf of a person. */
    function as(uid: number | undefined) {
        const headers: Record<string, string> = { "X-Api-Key": "board-key" };

        if (uid !== undefined) {
            headers["X-Acting-Uid"] = uid.toString();
        }

        return {
            get: (path: string) => request(app).get(path).set(headers),
            put: (path: string) => request(app).put(path).set(headers),
            patch: (path: string) => request(app).patch(path).set(headers),
            post: (path: string) => request(app).post(path).set(headers),
            delete: (path: string) => request(app).delete(path).set(headers),
        };
    }

    describe("GET /me", () => {
        it("answers for the acting person", async () => {
            expect((await as(manager).get("/me").expect(200)).body).toEqual({
                uid: manager,
                role: "manager",
                grants: ["flowaim"],
            });
            expect((await as(plain).get("/me").expect(200)).body).toEqual({
                uid: plain,
                role: null,
                grants: [],
            });
        });

        it("is forbidden without an acting uid", async () => {
            const response = await as(undefined).get("/me").expect(403);

            expect(response.body.error.code).toBe("FORBIDDEN");
            await request(app).get("/me").expect(403);
        });
    });

    describe("access", () => {
        it("rejects admin routes for people without a role", async () => {
            const response = await as(plain).get("/admin/variants").expect(403);

            expect(response.body.error.code).toBe("FORBIDDEN");
        });

        it("rejects admin routes without an acting uid", async () => {
            const keyOnly = await as(undefined)
                .get("/admin/variants")
                .expect(403);
            const anonymous = await request(app)
                .get("/admin/variants")
                .expect(403);

            expect(keyOnly.body.error.code).toBe("FORBIDDEN");
            expect(anonymous.body.error.code).toBe("FORBIDDEN");
        });

        it("keeps key and role routes to admins", async () => {
            await as(manager).get("/admin/keys").expect(403);
            await as(manager).get("/admin/users").expect(403);
            await as(manager)
                .put("/admin/users/5/role")
                .send({ role: "manager" })
                .expect(403);
            await as(manager)
                .post("/admin/keys")
                .send({ name: "x", rateLimitPerMinute: null })
                .expect(403);
            await as(manager).post("/admin/keys/board/revoke").expect(403);

            expect(await repository.findKey("x")).toBeUndefined();
        });
    });

    describe("variants", () => {
        it("lists every variant for a manager", async () => {
            const response = await as(manager)
                .get("/admin/variants")
                .expect(200);

            expect(response.body).toEqual([
                expect.objectContaining({
                    name: "droid-live",
                    public: true,
                    description: "Live",
                    instanceCount: 0,
                    available: false,
                }),
                expect.objectContaining({
                    name: "flowaim",
                    public: false,
                    aliases: ["experiment"],
                    instanceCount: 1,
                }),
            ]);
        });

        it("lets a manager edit a title and a multi-line description and applies it at once", async () => {
            const response = await as(manager)
                .patch("/admin/variants/droid-live")
                .send({ title: "FC Time", description: "Line one\nLine two" })
                .expect(200);

            expect(response.body).toMatchObject({
                name: "droid-live",
                title: "FC Time",
                description: "Line one\nLine two",
                public: true,
            });

            const listed = await request(app).get("/variants").expect(200);

            expect(listed.body).toContainEqual(
                expect.objectContaining({
                    name: "droid-live",
                    title: "FC Time",
                    description: "Line one\nLine two",
                }),
            );
        });

        it("rejects a manager changing visibility without applying other fields", async () => {
            const response = await as(manager)
                .patch("/admin/variants/droid-live")
                .send({ title: "x", public: true })
                .expect(403);

            expect(response.body.error.code).toBe("FORBIDDEN");
            expect(
                (await repository.findVariant("droid-live"))?.title,
            ).toBeNull();
        });

        it("lets an admin make a variant public", async () => {
            const response = await as(admin)
                .patch("/admin/variants/flowaim")
                .send({ public: true })
                .expect(200);

            expect(response.body).toMatchObject({
                name: "flowaim",
                public: true,
            });
            expect(
                (await request(app).get("/variants").expect(200)).body,
            ).toContainEqual(expect.objectContaining({ name: "flowaim" }));
        });

        it("rejects over-length descriptions", async () => {
            const response = await as(manager)
                .patch("/admin/variants/droid-live")
                .send({ description: "d".repeat(4001) })
                .expect(400);

            expect(response.body.error.code).toBe("INVALID_REQUEST");
            expect(
                (await repository.findVariant("droid-live"))?.description,
            ).toBe("Live");
        });

        it("rejects bodies that are not valid", async () => {
            const empty = await as(manager)
                .patch("/admin/variants/droid-live")
                .send({})
                .expect(400);
            const notJson = await as(manager)
                .patch("/admin/variants/droid-live")
                .set("Content-Type", "text/plain")
                .send("title=x")
                .expect(400);

            expect(empty.body.error.code).toBe("INVALID_REQUEST");
            expect(notJson.body.error.message).toBe(
                "Request body must be JSON, sent with Content-Type: application/json",
            );
        });

        it("answers 404 VARIANT_NOT_FOUND for an unknown variant", async () => {
            const response = await as(manager)
                .patch("/admin/variants/missing")
                .send({ title: "x" })
                .expect(404);

            expect(response.body.error.code).toBe("VARIANT_NOT_FOUND");
        });
    });

    describe("aliases and grants", () => {
        it("manages aliases and user grants as a manager", async () => {
            await as(manager)
                .put("/admin/aliases/fresh")
                .send({ variant: "droid-live" })
                .expect(204);
            await as(manager)
                .put("/admin/aliases/fresh")
                .send({ variant: "flowaim" })
                .expect(204);

            expect(
                (await as(manager).get("/admin/variants").expect(200)).body,
            ).toContainEqual(
                expect.objectContaining({
                    name: "flowaim",
                    aliases: ["experiment", "fresh"],
                }),
            );

            await as(manager).delete("/admin/aliases/fresh").expect(204);
            const missing = await as(manager)
                .delete("/admin/aliases/fresh")
                .expect(404);

            expect(missing.body.error.code).toBe("NOT_FOUND");

            await as(manager)
                .put("/admin/variants/droid-live/grants/7")
                .expect(204);
            await as(manager)
                .put("/admin/variants/droid-live/grants/4")
                .expect(204);

            expect(
                (
                    await as(manager)
                        .get("/admin/variants/droid-live/grants")
                        .expect(200)
                ).body,
            ).toEqual([4, 7]);

            await as(manager)
                .delete("/admin/variants/droid-live/grants/4")
                .expect(204);
            await as(manager)
                .delete("/admin/variants/droid-live/grants/4")
                .expect(404);

            expect(
                (
                    await as(manager)
                        .get("/admin/variants/droid-live/grants")
                        .expect(200)
                ).body,
            ).toEqual([7]);
        });

        it("rejects a bad uid and an unknown variant", async () => {
            await as(manager)
                .put("/admin/variants/droid-live/grants/abc")
                .expect(400);
            await as(manager)
                .put("/admin/variants/droid-live/grants/0")
                .expect(400);

            const response = await as(manager)
                .put("/admin/variants/missing/grants/7")
                .expect(404);

            expect(response.body.error.code).toBe("VARIANT_NOT_FOUND");
        });

        it("rejects an alias that is a variant name", async () => {
            const response = await as(manager)
                .put("/admin/aliases/flowaim")
                .send({ variant: "droid-live" })
                .expect(409);

            expect(response.body.error.code).toBe("CONFLICT");
        });
    });

    describe("users", () => {
        it("lets an admin list users and set roles", async () => {
            expect(
                (await as(admin).get("/admin/users").expect(200)).body,
            ).toEqual([
                { uid: admin, role: "admin", grants: [] },
                { uid: manager, role: "manager", grants: ["flowaim"] },
            ]);

            const response = await as(admin)
                .put("/admin/users/5/role")
                .send({ role: "manager" })
                .expect(200);

            expect(response.body).toEqual({
                uid: 5,
                role: "manager",
                grants: [],
            });

            expect(
                (
                    await as(admin)
                        .put("/admin/users/5/role")
                        .send({ role: null })
                        .expect(200)
                ).body,
            ).toEqual({ uid: 5, role: null, grants: [] });
        });

        it("refuses an admin demoting themselves", async () => {
            const response = await as(admin)
                .put(`/admin/users/${admin.toString()}/role`)
                .send({ role: null })
                .expect(409);

            expect(response.body.error.code).toBe("CONFLICT");
            expect((await as(admin).get("/me").expect(200)).body.role).toBe(
                "admin",
            );
        });

        it("rejects an unknown role", async () => {
            const response = await as(admin)
                .put("/admin/users/5/role")
                .send({ role: "owner" })
                .expect(400);

            expect(response.body.error.code).toBe("INVALID_REQUEST");
        });
    });

    describe("keys", () => {
        it("lists keys without hashes", async () => {
            const response = await as(admin).get("/admin/keys").expect(200);

            expect(response.body).toEqual([
                {
                    name: "board",
                    rateLimitPerMinute: null,
                    allVariants: false,
                    canActForUsers: true,
                    grants: [],
                    createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/u),
                    revokedAt: null,
                },
                expect.objectContaining({ name: "plain", allVariants: true }),
            ]);
            expect(JSON.stringify(response.body)).not.toContain("hash");
        });

        it("creates a key and returns the raw key once", async () => {
            const response = await as(admin)
                .post("/admin/keys")
                .send({
                    name: "site",
                    rateLimitPerMinute: 30,
                    grants: ["flowaim"],
                })
                .expect(201);

            expect(response.body).toEqual({
                key: expect.objectContaining({
                    name: "site",
                    rateLimitPerMinute: 30,
                    allVariants: false,
                    canActForUsers: false,
                    grants: ["flowaim"],
                    revokedAt: null,
                }),
                rawKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            });

            const rawKey = (response.body as { rawKey: string }).rawKey;
            const listed = await request(app)
                .get("/variants")
                .set("X-Api-Key", rawKey)
                .expect(200);

            expect(listed.body).toContainEqual(
                expect.objectContaining({ name: "flowaim" }),
            );
            expect(
                JSON.stringify((await as(admin).get("/admin/keys")).body),
            ).not.toContain(rawKey);
        });

        it("refuses a taken or invalid key name", async () => {
            const taken = await as(admin)
                .post("/admin/keys")
                .send({ name: "board", rateLimitPerMinute: null })
                .expect(409);

            expect(taken.body.error.code).toBe("CONFLICT");

            await as(admin)
                .post("/admin/keys")
                .send({ name: "Bad Name", rateLimitPerMinute: null })
                .expect(400);
            await as(admin)
                .post("/admin/keys")
                .send({ name: "ok", rateLimitPerMinute: null, extra: 1 })
                .expect(400);
        });

        it("updates a key, grants and ungrants variants, and revokes it", async () => {
            const updated = await as(admin)
                .patch("/admin/keys/plain")
                .send({ rateLimitPerMinute: 5, canActForUsers: true })
                .expect(200);

            expect(updated.body).toMatchObject({
                name: "plain",
                rateLimitPerMinute: 5,
                canActForUsers: true,
                allVariants: true,
            });

            await as(admin).put("/admin/keys/plain/grants/flowaim").expect(204);
            expect(
                (await as(admin).get("/admin/keys")).body.find(
                    (key: { name: string }) => key.name === "plain",
                ).grants,
            ).toEqual(["flowaim"]);

            await as(admin)
                .delete("/admin/keys/plain/grants/flowaim")
                .expect(204);
            await as(admin)
                .delete("/admin/keys/plain/grants/flowaim")
                .expect(404);

            await as(admin).post("/admin/keys/plain/revoke").expect(204);
            await request(app)
                .get("/variants")
                .set("X-Api-Key", "plain-key")
                .expect(401);

            const again = await as(admin)
                .post("/admin/keys/plain/revoke")
                .expect(409);

            expect(again.body.error.code).toBe("CONFLICT");
            await as(admin).post("/admin/keys/missing/revoke").expect(404);
        });
    });

    describe("logging", () => {
        it("logs admin changes without bodies", async () => {
            await as(manager)
                .patch("/admin/variants/droid-live")
                .send({ description: "very secret description text" })
                .expect(200);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const lines = vi
                .mocked(console.log)
                .mock.calls.map((call) => call.join(" "));

            expect(lines).toContain(
                "Admin change by uid 2: PATCH /admin/variants/droid-live",
            );
            expect(lines.join("\n")).not.toContain("secret");
        });

        it("does not log reads or refused changes", async () => {
            await as(manager).get("/admin/variants").expect(200);
            await as(plain)
                .patch("/admin/variants/droid-live")
                .send({ title: "x" })
                .expect(403);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(vi.mocked(console.log).mock.calls.join("\n")).not.toContain(
                "Admin change",
            );
        });
    });
});
