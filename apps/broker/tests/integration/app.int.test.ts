import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import { hashApiKey } from "@/registry/keys";
import { RegistryRepository } from "@/repositories/RegistryRepository";
import { maxRequestBodyBytes } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { freePort } from "@dpp/server/testing";
import { testConfig, testProcessorApiKey } from "@test/utils/config";
import { createTestContainer, type TestContainer } from "@test/utils/container";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import {
    startStubProcessor,
    type StubProcessor,
} from "@test/utils/stubProcessor";
import type { DependencyContainer } from "tsyringe";
import request from "supertest";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

describe("broker API (integration)", () => {
    const resources = new AsyncDisposableStack();
    let live: StubProcessor;
    let flowaim: StubProcessor;
    let pairFirst: StubProcessor;
    let pairSecond: StubProcessor;
    let wrong: StubProcessor;
    let testContainer: TestContainer;
    let container: DependencyContainer;
    let app: ReturnType<typeof createApp>;
    let database: TestDatabase;

    beforeAll(async () => {
        live = resources.use(await startStubProcessor("droid-live"));
        flowaim = resources.use(await startStubProcessor("flowaim"));
        pairFirst = resources.use(await startStubProcessor("pair"));
        pairSecond = resources.use(await startStubProcessor("pair"));
        wrong = resources.use(await startStubProcessor("someone-else"));

        database = resources.use(await createTestDatabase());
        const repository = new RegistryRepository(database.db);
        const deadPort = await freePort();

        await repository.insertVariant({
            name: "droid-live",
            public: true,
            pinned: false,
            title: null,
            description: "Live",
        });
        await repository.insertVariant({
            name: "flowaim",
            public: false,
            pinned: false,
            title: null,
            description: null,
        });
        await repository.insertVariant({
            name: "pair",
            public: true,
            pinned: false,
            title: null,
            description: null,
        });
        await repository.insertVariant({
            name: "wrong",
            public: true,
            pinned: false,
            title: null,
            description: null,
        });
        await repository.insertVariant({
            name: "offline",
            public: true,
            pinned: false,
            title: null,
            description: null,
        });
        await repository.insertInstance("droid-live", live.url);
        await repository.insertInstance("flowaim", flowaim.url);
        await repository.insertInstance("pair", pairFirst.url);
        await repository.insertInstance("pair", pairSecond.url);
        await repository.insertInstance("wrong", wrong.url);
        await repository.insertInstance(
            "offline",
            `http://127.0.0.1:${deadPort.toString()}`,
        );
        await repository.setAlias("live-droid", "droid-live");
        await repository.setAlias("experiment", "flowaim");
        await repository.insertKey({
            name: "bot",
            hash: hashApiKey("bot-key"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: false,
            grants: ["flowaim"],
        });
        await repository.insertKey({
            name: "tiny",
            hash: hashApiKey("tiny-key"),
            rateLimitPerMinute: 1,
            allVariants: false,
            canActForUsers: false,
            grants: [],
        });

        await repository.insertKey({
            name: "board",
            hash: hashApiKey("board-key"),
            rateLimitPerMinute: null,
            allVariants: false,
            canActForUsers: true,
            grants: [],
        });
        await repository.grantUser(1001, "flowaim");

        testContainer = resources.use(
            await createTestContainer({ db: database.db }),
        );
        container = testContainer.container;

        await container.resolve(dependencyTokens.registryService).load();
        await container.resolve(dependencyTokens.healthMonitor).checkAll();
    });

    afterAll(() => resources.disposeAsync());

    // A new app per test, so rate limit counters start from zero. Spies are restored after each test
    // (`restoreMocks`), so they are installed here rather than in beforeAll.
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        app = createApp(container);
    });

    describe("GET /variants", () => {
        it("lists public variants for anonymous callers, with health and /info details", async () => {
            const response = await request(app).get("/variants").expect(200);

            expect(response.body).toEqual([
                {
                    name: "droid-live",
                    title: null,
                    aliases: ["live-droid"],
                    description: "Live",
                    public: true,
                    pinned: false,
                    available: true,
                    healthyInstanceCount: 1,
                    mode: Modes.Droid,
                    algorithm: "live",
                    calculatorVersion: "0123456789abcdef",
                    builtAt: "2026-10-07T00:00:00.000Z",
                },
                expect.objectContaining({
                    name: "offline",
                    available: false,
                    healthyInstanceCount: 0,
                    mode: null,
                }),
                expect.objectContaining({
                    name: "pair",
                    available: true,
                    healthyInstanceCount: 2,
                }),
                expect.objectContaining({
                    name: "wrong",
                    available: false,
                    mode: null,
                }),
            ]);
        });

        it("adds granted private variants for a key", async () => {
            const response = await request(app)
                .get("/variants")
                .set("X-Api-Key", "bot-key")
                .expect(200);

            expect(response.body).toContainEqual(
                expect.objectContaining({
                    name: "flowaim",
                    aliases: ["experiment"],
                }),
            );
        });

        it("resolves a single variant by alias", async () => {
            const response = await request(app)
                .get("/variants/live-droid")
                .expect(200);

            expect(response.body).toMatchObject({ name: "droid-live" });
        });

        it("hides a private variant and its alias from anonymous callers", async () => {
            for (const name of ["flowaim", "experiment"]) {
                const response = await request(app).get(`/variants/${name}`);

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    error: {
                        code: "VARIANT_NOT_FOUND",
                        message: `Variant "${name}" not found`,
                    },
                });
            }
        });
    });

    describe("acting for a person", () => {
        const actAs = (uid: number) => ({
            "X-Api-Key": "board-key",
            "X-Acting-Uid": uid.toString(),
        });

        it("filters GET /variants and forwarding by the acting person", async () => {
            const granted = await request(app)
                .get("/variants")
                .set(actAs(1001))
                .expect(200);
            const other = await request(app)
                .get("/variants")
                .set(actAs(1002))
                .expect(200);

            expect(granted.body).toContainEqual(
                expect.objectContaining({ name: "flowaim", title: null }),
            );
            expect(other.body).not.toContainEqual(
                expect.objectContaining({ name: "flowaim" }),
            );

            const before = flowaim.requests.length;

            await request(app)
                .post("/variants/flowaim/difficulty")
                .set(actAs(1002))
                .send({})
                .expect(404, {
                    error: {
                        code: "VARIANT_NOT_FOUND",
                        message: 'Variant "flowaim" not found',
                    },
                });
            expect(flowaim.requests.length).toBe(before);

            await request(app)
                .post("/variants/flowaim/difficulty")
                .set(actAs(1001))
                .send({})
                .expect(200);
        });

        it("rejects an acting uid from a key that cannot act", async () => {
            const response = await request(app)
                .get("/variants")
                .set({ "X-Api-Key": "bot-key", "X-Acting-Uid": "1001" });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: { code: "INVALID_REQUEST" },
            });
        });

        it("allows the header in CORS preflights", async () => {
            const response = await request(app)
                .options("/variants")
                .set("Origin", "https://example.com")
                .set("Access-Control-Request-Method", "GET")
                .set("Access-Control-Request-Headers", "x-acting-uid")
                .expect(204);

            expect(response.headers["access-control-allow-headers"]).toMatch(
                /X-Acting-Uid/i,
            );
        });
    });

    describe("authentication", () => {
        it.each(["", "not-a-key"])("rejects the key %j", async (key) => {
            const response = await request(app)
                .get("/variants")
                .set("X-Api-Key", key);

            expect(response.status).toBe(401);
        });
    });

    describe("forwarding", () => {
        it("forwards the body unchanged with the processor key, and names the variant", async () => {
            const body = JSON.stringify({ beatmap: { id: 1 }, mods: [] });
            const before = live.requests.length;

            const response = await request(app)
                .post("/variants/live-droid/performance/replay")
                .set("Content-Type", "application/json")
                .send(body)
                .expect(200);

            expect(response.headers["x-variant"]).toBe("droid-live");
            expect(response.body).toEqual({ route: "/performance/replay" });
            expect(live.requests.slice(before)).toEqual([
                {
                    path: "/performance/replay",
                    apiKey: testProcessorApiKey,
                    contentType: "application/json",
                    body,
                },
            ]);
        });

        it("passes processor errors through", async () => {
            live.reply(() => ({
                status: 404,
                body: {
                    error: { code: "BEATMAP_NOT_FOUND", message: "missing" },
                },
            }));

            try {
                const response = await request(app)
                    .post("/variants/droid-live/difficulty")
                    .send({ beatmap: { id: 1 } });

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    error: { code: "BEATMAP_NOT_FOUND", message: "missing" },
                });
            } finally {
                live.reply((req) => ({
                    status: 200,
                    body: { route: req.path },
                }));
            }
        });

        it("rejects bodies that are not JSON", async () => {
            const response = await request(app)
                .post("/variants/droid-live/difficulty")
                .set("Content-Type", "text/plain")
                .send("hello");

            expect(response.status).toBe(400);
        });

        it("rejects bodies over the limit with 413", async () => {
            const response = await request(app)
                .post("/variants/droid-live/difficulty")
                .set("Content-Type", "application/json")
                .send(
                    JSON.stringify({
                        padding: "x".repeat(maxRequestBodyBytes),
                    }),
                );

            expect(response.status).toBe(413);
            expect(response.body).toEqual({
                error: {
                    code: "INVALID_REQUEST",
                    message: "Request body is too large",
                },
            });
        });

        it("answers unknown processor routes with 404 without calling a processor", async () => {
            const before = live.requests.length;

            await request(app)
                .post("/variants/droid-live/info")
                .send({})
                .expect(404, {
                    error: {
                        code: "INVALID_REQUEST",
                        message: "Route not found",
                    },
                });
            expect(live.requests.length).toBe(before);
        });

        it("never forwards to a private variant the caller cannot use", async () => {
            const before = flowaim.requests.length;

            await request(app)
                .post("/variants/experiment/difficulty")
                .send({})
                .expect(404);
            expect(flowaim.requests.length).toBe(before);

            await request(app)
                .post("/variants/experiment/difficulty")
                .set("X-Api-Key", "bot-key")
                .send({})
                .expect(200);
        });

        it("never uses an instance that reports another variant", async () => {
            await request(app)
                .post("/variants/wrong/difficulty")
                .send({})
                .expect(503);
            expect(wrong.requests).toEqual([]);
        });

        it("fails over to the other instance when one stops", async () => {
            await pairFirst.close();

            for (let i = 0; i < 2; i++) {
                await request(app)
                    .post("/variants/pair/difficulty")
                    .set("X-Api-Key", "bot-key")
                    .send({})
                    .expect(200);
            }

            const pair = await request(app).get("/variants/pair").expect(200);

            expect(pair.body).toMatchObject({ available: true });
            expect(pairSecond.requests.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("rate limits", () => {
        it("limits a key to its own limit", async () => {
            const send = () =>
                request(app).get("/variants").set("X-Api-Key", "tiny-key");

            await send().expect(200);

            const limited = await send().expect(429);

            expect(limited.body).toMatchObject({
                error: { code: "RATE_LIMITED" },
            });
            expect(limited.headers.ratelimit).toBeDefined();
        });

        it("limits anonymous callers by ANON_RATE_LIMIT", async () => {
            // testConfig.anonymousRateLimit is 3.
            for (let i = 0; i < 3; i++) {
                const response = await request(app).get("/variants");

                expect(response.status).toBe(200);
            }

            const limited = await request(app).get("/variants");

            expect(limited.status).toBe(429);
        });

        it("does not limit unlimited keys", async () => {
            for (let i = 0; i < 6; i++) {
                const response = await request(app)
                    .get("/variants")
                    .set("X-Api-Key", "bot-key");

                expect(response.status).toBe(200);
            }
        });
    });

    describe("browsers", () => {
        it("answers CORS preflights for any origin", async () => {
            const response = await request(app)
                .options("/variants/droid-live/difficulty")
                .set("Origin", "https://example.com")
                .set("Access-Control-Request-Method", "POST")
                .set("Access-Control-Request-Headers", "content-type,x-api-key")
                .expect(204);

            expect(response.headers["access-control-allow-origin"]).toBe("*");
            expect(response.headers["access-control-allow-headers"]).toMatch(
                /X-Api-Key/i,
            );
        });

        it("lets cross-origin pages read responses and the X-Variant header", async () => {
            const response = await request(app)
                .post("/variants/droid-live/difficulty")
                .set("Origin", "https://example.com")
                .send({})
                .expect(200);

            expect(response.headers["access-control-expose-headers"]).toMatch(
                /X-Variant/,
            );
            expect(response.headers["cross-origin-resource-policy"]).toBe(
                "cross-origin",
            );
        });
    });

    it("refuses callers without a key when ANON_RATE_LIMIT is 0", async () => {
        await using closed = await createTestContainer({
            db: database.db,
            config: { ...testConfig, anonymousRateLimit: 0 },
        });

        await closed.container.resolve(dependencyTokens.registryService).load();

        const closedApp = createApp(closed.container);

        const rejected = await request(closedApp).get("/variants");

        expect(rejected.status).toBe(401);
        expect(rejected.body).toEqual({
            error: {
                code: "UNAUTHORIZED",
                message: "An API key is required",
            },
        });

        const accepted = await request(closedApp)
            .get("/variants")
            .set("X-Api-Key", "bot-key");

        expect(accepted.status).toBe(200);
    });

    it("records usage per variant and caller", async () => {
        const usage = container.resolve(dependencyTokens.usageStats);

        usage.takeSummary();
        await request(app)
            .post("/variants/live-droid/difficulty")
            .send({})
            .expect(200);

        expect(usage.takeSummary()).toEqual([
            expect.stringMatching(/variant droid-live: 1 requests \(2xx 1\)/),
            expect.stringMatching(
                /caller anonymous: 1 requests, 0 rate-limited/,
            ),
        ]);
    });
});
