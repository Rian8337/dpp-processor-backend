import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import { performanceBody } from "@test/utils/bodies";
import { testApiKey } from "@test/utils/config";
import { createTestContainer } from "@test/utils/container";
import {
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    retryLater,
} from "@test/utils/fakes";
import { scoreRow, testHash } from "@test/utils/rows";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

describe("score service API (integration)", () => {
    const resources = new AsyncDisposableStack();
    const repository = new InMemoryOfficialScoreRepository();
    const broker = new FakeBrokerClient(() => ({
        ok: true,
        value: performanceBody(120),
    }));
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
        const testContainer = resources.use(
            await createTestContainer({
                overrides: (c) => {
                    c.registerInstance(
                        dependencyTokens.officialScoreRepository,
                        repository,
                    );
                    c.registerInstance(
                        dependencyTokens.replayStore,
                        new InMemoryReplayStore(),
                    );
                    c.registerInstance(dependencyTokens.brokerClient, broker);
                },
            }),
        );

        app = createApp(testContainer.container);
    });

    afterAll(() => resources.disposeAsync());

    const path = `/online-scores?uid=7&hash=${testHash}&variant=live-droid`;
    const get = (url: string) =>
        request(app).get(url).set("X-Api-Key", testApiKey);

    it("requires the API key", async () => {
        const missing = await request(app).get(path);
        const wrong = await request(app).get(path).set("X-Api-Key", "wrong");

        expect(missing.status).toBe(401);
        expect(missing.body).toMatchObject({
            error: { code: "UNAUTHORIZED" },
        });
        expect(wrong.status).toBe(401);
    });

    it("rejects an invalid query", async () => {
        const response = await get(
            `/online-scores?uid=abc&hash=${testHash}&variant=live-droid`,
        );

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("INVALID_REQUEST");
        expect(response.body.error.message).toMatch(/^uid: /);
    });

    it("answers 404 for an unknown score", async () => {
        const response = await get(path);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe("SCORE_NOT_FOUND");
    });

    it("calculates a score without a replay", async () => {
        repository.scores.push(scoreRow({ id: 10 }));

        const response = await get(path);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            score: { id: 10, uid: 7, hash: testHash, best: false },
            source: "score",
            calculation: performanceBody(120),
        });
    });

    it("passes a broker failure through", async () => {
        broker.onPerformance = () => retryLater;

        const response = await get(path);

        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe("VARIANT_UNAVAILABLE");
    });

    it("answers 404 for an unknown route", async () => {
        const response = await get("/nothing");

        expect(response.status).toBe(404);
        expect(response.body.error).toMatchObject({
            code: "INVALID_REQUEST",
            message: "Route not found",
        });
    });
});
