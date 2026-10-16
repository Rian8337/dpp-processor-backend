import { createApp } from "@/app";
import { difficultyAttributesTable } from "@/database/schema";
import { processorRoutes } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { createTestContainer, testApiKey } from "@test/utils/container";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { beatmapFixtures } from "@test/utils/fixtures";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// PGlite-backed containers and the replay analyzer's fixed 2 s error delay take seconds; keep a wide margin.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

describe.each([Modes.Droid, Modes.Osu])("%s API (integration)", (mode) => {
    const resources = new AsyncDisposableStack();
    let testDatabase: TestDatabase;
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
        testDatabase = resources.use(await createTestDatabase());
        const testContainer = resources.use(
            await createTestContainer({ mode, db: testDatabase.db }),
        );

        app = createApp(testContainer.container);
    });

    afterAll(() => resources.disposeAsync());

    it("calculates performance and stores difficulty attributes once", async () => {
        const body = {
            beatmap: { id: beatmapFixtures.highPowered.id },
            mods: [{ acronym: "HD" }],
            score: { nmiss: 1 },
        };

        const first = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send(body);
        const second = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send(body);

        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            performance: { total: expect.any(Number) },
            score: { nmiss: 1 },
        });
        expect(second.body).toEqual(first.body);
        expect(
            await testDatabase.db.select().from(difficultyAttributesTable),
        ).toHaveLength(1);
    });

    it("returns 404 for an unknown beatmap", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 999 } });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: { code: "BEATMAP_NOT_FOUND" },
        });
    });

    it("returns 422 for an uploaded file that is not a beatmap", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { file: "definitely not a beatmap" } });

        expect(response.status).toBe(422);
        expect(response.body).toMatchObject({
            error: { code: "INVALID_BEATMAP" },
        });
    });

    it.each(processorRoutes)(
        "serves %s, the route the broker forwards to",
        async (route) => {
            // An empty body fails validation, which proves the route exists (an unknown route would be 404).
            const response = await request(app)
                .post(route)
                .set("X-Api-Key", testApiKey)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: { code: "INVALID_REQUEST" },
            });
        },
    );
});
