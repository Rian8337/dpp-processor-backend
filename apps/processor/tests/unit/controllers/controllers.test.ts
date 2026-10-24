import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import { BeatmapService } from "@/services/BeatmapService";
import type { ICalculationService } from "@/services/ICalculationService";
import { NotFoundError } from "@/types/errors";
import { maxRequestBodyBytes } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import {
    createTestContainer,
    testApiKey,
    type TestContainer,
} from "@test/utils/container";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PGlite-backed containers and the replay analyzer's fixed 2 s error delay take seconds; keep a wide margin.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

const difficulty = calculateFixtureDifficulty("discoprince", Modes.Droid);

describe("controllers", () => {
    let calculateDifficulty: ReturnType<
        typeof vi.fn<ICalculationService["calculateDifficulty"]>
    >;
    let calculatePerformance: ReturnType<
        typeof vi.fn<ICalculationService["calculatePerformance"]>
    >;
    let calculateReplayPerformance: ReturnType<
        typeof vi.fn<ICalculationService["calculateReplayPerformance"]>
    >;
    let testContainer: TestContainer;
    let app: ReturnType<typeof createApp>;

    beforeEach(async () => {
        calculateDifficulty = vi.fn<ICalculationService["calculateDifficulty"]>(
            () => Promise.resolve({ difficulty }),
        );
        calculatePerformance =
            vi.fn<ICalculationService["calculatePerformance"]>();
        calculateReplayPerformance =
            vi.fn<ICalculationService["calculateReplayPerformance"]>();

        const calculations: ICalculationService = {
            calculateDifficulty,
            calculatePerformance,
            calculateReplayPerformance,
        };

        testContainer = await createTestContainer({
            overrides: (c) =>
                c.registerInstance(
                    dependencyTokens.calculationService,
                    calculations,
                ),
        });

        app = createApp(testContainer.container);
    });

    afterEach(() => testContainer[Symbol.asyncDispose]());

    it("serves /info without an API key", async () => {
        const response = await request(app).get("/info");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            id: `test-${Modes.Droid}`,
            mode: Modes.Droid,
            algorithm: "live",
            calculatorVersion: "0123456789abcdef",
            builtAt: "2026-10-05T00:00:00.000Z",
        });
    });

    it("requires the API key elsewhere", async () => {
        for (const key of [undefined, "wrong"]) {
            const req = request(app)
                .post("/difficulty")
                .send({ beatmap: { id: 1 } });
            const response = await (key ? req.set("X-Api-Key", key) : req);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                error: {
                    code: "UNAUTHORIZED",
                    message: "Missing or invalid API key",
                },
            });
        }

        expect(calculateDifficulty).not.toHaveBeenCalled();
    });

    it("passes validated requests with defaults to the service", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            difficulty: { starRating: difficulty.starRating },
        });
        expect(calculateDifficulty).toHaveBeenCalledWith({
            beatmap: { id: 1 },
            mods: [],
            strainChart: false,
        });
    });

    it.each(["/difficulty", "/performance", "/performance/replay"])(
        "rejects invalid %s bodies with 400",
        async (path) => {
            const response = await request(app)
                .post(path)
                .set("X-Api-Key", testApiKey)
                .send({ beatmap: { id: -1 } });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: { code: "INVALID_REQUEST" },
            });
            expect(calculateDifficulty).not.toHaveBeenCalled();
            expect(calculatePerformance).not.toHaveBeenCalled();
            expect(calculateReplayPerformance).not.toHaveBeenCalled();
        },
    );

    it("maps API errors to their status and code", async () => {
        calculatePerformance.mockRejectedValueOnce(
            new NotFoundError("BEATMAP_NOT_FOUND", "Beatmap not found"),
        );

        const response = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: { code: "BEATMAP_NOT_FOUND", message: "Beatmap not found" },
        });
    });

    it("hides unexpected errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        calculatePerformance.mockRejectedValueOnce(new Error("secret details"));

        const response = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
    });

    it("returns JSON errors for malformed JSON, oversized bodies, and unknown routes", async () => {
        const malformed = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .set("Content-Type", "application/json")
            .send("{ not json");

        expect(malformed.status).toBe(400);
        expect(malformed.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });

        const oversized = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { file: "x".repeat(maxRequestBodyBytes + 1) } });

        expect(oversized.status).toBe(413);
        expect(oversized.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });

        const unknown = await request(app)
            .get("/nope")
            .set("X-Api-Key", testApiKey);

        expect(unknown.status).toBe(404);
        expect(unknown.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });
    });

    it("describes body errors accurately", async () => {
        const malformed = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .set("Content-Type", "application/json")
            .send("{ not json");

        expect(malformed.body.error.message).toBe(
            "Request body is not valid JSON",
        );

        const charset = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .set("Content-Type", "application/json; charset=iso-8859-1")
            .send("{}");

        expect(charset.status).toBe(415);
        expect(charset.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "Unsupported request body charset",
            },
        });

        const encoding = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .set("Content-Type", "application/json")
            .set("Content-Encoding", "compress")
            .send("{}");

        expect(encoding.status).toBe(415);
        expect(encoding.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "Unsupported request body encoding",
            },
        });
    });

    it("registers real services by default", async () => {
        await using defaults = await createTestContainer();

        expect(
            defaults.container.resolve(dependencyTokens.beatmapService),
        ).toBeInstanceOf(BeatmapService);
    });
});
