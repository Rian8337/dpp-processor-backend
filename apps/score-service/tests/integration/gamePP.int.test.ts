import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import type { GamePPResult, IGamePPService } from "@/services/IGamePPService";
import { ModHidden } from "@rian8337/osu-base";
import type { CalculateScoreFields, GamePPResponse } from "@dpp/shared";
import { createTestContainer } from "@test/utils/container";
import { testHash } from "@test/utils/rows";
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

const answer: GamePPResponse = { pp: 1, pp_multiplier: 0.5 };
const nothing = { pp: null, pp_multiplier: null };
const mods = JSON.stringify([new ModHidden().serialize()]);
const form = {
    hash: testHash.toUpperCase(),
    mods,
    combo: "100",
    perfect: "90",
    good: "5",
    bad: "1",
    miss: "2",
    total_score: "123456",
};
const expectedFields: CalculateScoreFields = {
    hash: testHash,
    mods: [new ModHidden().serialize()],
    combo: 100,
    perfect: 90,
    good: 5,
    bad: 1,
    miss: 2,
    totalScore: 123456,
    sliderHits: null,
    ppMultiplier: 1,
};

class RecordingGamePPService implements IGamePPService {
    result: GamePPResult = { kind: "ok", response: answer };
    scores: CalculateScoreFields[] = [];
    replays: { replay: Buffer; variant: string | undefined }[] = [];

    calculateScore(fields: CalculateScoreFields) {
        this.scores.push(fields);
        return Promise.resolve(this.result);
    }

    calculateReplay(replay: Buffer, variant?: string) {
        this.replays.push({ replay, variant });
        return Promise.resolve(this.result);
    }
}

describe("game pp endpoints (integration)", () => {
    const resources = new AsyncDisposableStack();
    const service = new RecordingGamePPService();
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);

        const testContainer = resources.use(
            await createTestContainer({
                overrides: (c) => {
                    c.registerInstance(dependencyTokens.gamePPService, service);
                },
            }),
        );

        app = createApp(testContainer.container);
    });

    beforeEach(() => {
        service.result = { kind: "ok", response: answer };
        service.scores = [];
        service.replays = [];
    });

    afterAll(() => resources.disposeAsync());

    describe("POST /calculate-score", () => {
        it("reads a URL-encoded form", async () => {
            const response = await request(app)
                .post("/calculate-score")
                .type("form")
                .send(form);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(answer);
            expect(service.scores).toEqual([expectedFields]);
        });

        it("reads multipart fields", async () => {
            let post = request(app).post("/calculate-score");

            for (const [name, value] of Object.entries(form)) {
                post = post.field(name, value);
            }

            const response = await post;

            expect(response.status).toBe(200);
            expect(response.body).toEqual(answer);
            expect(service.scores).toEqual([expectedFields]);
        });

        it("reads JSON", async () => {
            const response = await request(app)
                .post("/calculate-score")
                .send({
                    ...form,
                    combo: 100,
                    perfect: 90,
                    good: 5,
                    bad: 1,
                    miss: 2,
                    total_score: 123456,
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(answer);
            expect(service.scores).toEqual([expectedFields]);
        });

        it.each([
            [
                "an invalid field",
                (r: request.Test) =>
                    r.type("form").send({ ...form, miss: "-1" }),
            ],
            [
                "malformed JSON",
                (r: request.Test) =>
                    r.set("Content-Type", "application/json").send("{"),
            ],
            [
                "an attached file",
                (r: request.Test) => {
                    for (const [name, value] of Object.entries(form)) {
                        r.field(name, value);
                    }

                    return r.attach("replayfile", Buffer.from("x"), "x.odr");
                },
            ],
        ])("answers nulls for %s", async (_, build) => {
            const response = await build(request(app).post("/calculate-score"));

            expect(response.status).toBe(200);
            expect(response.body).toEqual(nothing);
            expect(service.scores).toEqual([]);
        });
    });

    describe("POST /calculate-replay", () => {
        const replay = Buffer.from("odr contents");

        it("passes the file and variant on", async () => {
            const response = await request(app)
                .post("/calculate-replay")
                .attach("replayfile", replay, "x.odr")
                .field("variant", "droid-test");

            expect(response.status).toBe(200);
            expect(response.body).toEqual(answer);
            expect(service.replays).toEqual([
                { replay, variant: "droid-test" },
            ]);
        });

        it.each([
            ["no file", (r: request.Test) => r.field("variant", "droid-test")],
            [
                "a file in another field",
                (r: request.Test) => r.attach("other", replay, "x.odr"),
            ],
            [
                "a file over 2 MiB",
                (r: request.Test) =>
                    r.attach(
                        "replayfile",
                        Buffer.alloc(2 * 1024 * 1024 + 1),
                        "x.odr",
                    ),
            ],
        ])("answers nulls for %s", async (_, build) => {
            const response = await build(
                request(app).post("/calculate-replay"),
            );

            expect(response.status).toBe(200);
            expect(response.body).toEqual(nothing);
            expect(service.replays).toEqual([]);
        });
    });

    describe("failures", () => {
        it.each([
            [
                "/calculate-score",
                (r: request.Test) => r.type("form").send(form),
            ],
            [
                "/calculate-replay",
                (r: request.Test) =>
                    r.attach("replayfile", Buffer.from("x"), "x.odr"),
            ],
        ])("%s answers nulls for a permanent failure", async (path, build) => {
            service.result = { kind: "failed" };

            const response = await build(request(app).post(path));

            expect(response.status).toBe(200);
            expect(response.body).toEqual(nothing);
        });

        it.each([
            [
                "/calculate-score",
                (r: request.Test) => r.type("form").send(form),
            ],
            [
                "/calculate-replay",
                (r: request.Test) =>
                    r.attach("replayfile", Buffer.from("x"), "x.odr"),
            ],
        ])(
            "%s closes the connection for a retry-later failure",
            async (path, build) => {
                service.result = { kind: "retry" };

                await expect(
                    build(request(app).post(path)),
                ).rejects.toMatchObject({
                    code: "ECONNRESET",
                });
            },
        );

        it("closes the connection when the service throws", async () => {
            const throwing = vi
                .spyOn(service, "calculateScore")
                .mockRejectedValueOnce(new Error("bug"));

            await expect(
                request(app).post("/calculate-score").type("form").send(form),
            ).rejects.toMatchObject({ code: "ECONNRESET" });
            throwing.mockRestore();
        });
    });

    it("ignores X-Forwarded-For when checking for a loopback connection", async () => {
        const response = await request(app)
            .post("/calculate-score")
            .set("X-Forwarded-For", "10.0.0.1")
            .type("form")
            .send(form);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(answer);
    });
});
