import { ScoreCalculator } from "@/services/ScoreCalculator";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { FakeBrokerClient } from "@test/utils/fakes";
import { scoreRow, testHash } from "@test/utils/rows";
import { ModDoubleTime, ModHardRock, ModHidden } from "@rian8337/osu-base";
import { describe, expect, it } from "vitest";

describe("ScoreCalculator", () => {
    it("calculates stored stats with slider hit counts and total score", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(100),
        }));
        const calculator = new ScoreCalculator(broker);
        // The generated total score (score × score multiplier) is sent, as the game sends total_score.
        const stats = scoreRow({
            mods: JSON.stringify([new ModHidden().serialize()]),
            score: 1_000_000,
            scoreMultiplier: 1.1,
        });

        const result = await calculator.calculateStats("live-droid", stats, {
            strainChart: true,
        });

        expect(result.ok).toBe(true);
        expect(broker.calls).toEqual([
            {
                kind: "performance",
                variant: "live-droid",
                request: {
                    beatmap: { hash: testHash },
                    mods: [new ModHidden().serialize()],
                    score: {
                        n300: 400,
                        n100: 20,
                        n50: 2,
                        nmiss: 1,
                        combo: 500,
                        totalScore: 1_100_000,
                        sliderHeadHits: 100,
                        sliderTickHits: 200,
                        sliderRepeatHits: 10,
                        sliderEndHits: 99,
                    },
                    strainChart: true,
                },
            },
        ]);
    });

    it("leaves slider hit counts out unless all four are recorded", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(1),
        }));

        await new ScoreCalculator(broker).calculateStats(
            "v",
            scoreRow({ sliderTickHit: null }),
        );

        const call = broker.calls[0];

        expect(
            call?.kind === "performance" && call.request.score,
        ).not.toHaveProperty("sliderHeadHits");
    });

    it("fails permanently, without calling the broker, for unreadable mods", async () => {
        const broker = new FakeBrokerClient();

        expect(
            await new ScoreCalculator(broker).calculateStats(
                "v",
                scoreRow({ mods: "{" }),
            ),
        ).toEqual({
            ok: false,
            kind: "rejected",
            status: 422,
            code: "INVALID_REQUEST",
            message: "The score's mods are unreadable",
        });
        expect(broker.calls).toEqual([]);
    });

    it("sends a replay base64-encoded", async () => {
        const broker = new FakeBrokerClient(undefined, () => ({
            ok: true,
            value: replayPerformanceBody(5),
        }));

        await new ScoreCalculator(broker).calculateReplay(
            "v",
            Buffer.from("odr"),
        );

        expect(broker.calls[0]).toEqual({
            kind: "replay",
            variant: "v",
            request: {
                replay: Buffer.from("odr").toString("base64"),
                strainChart: false,
            },
        });
    });

    it("overrides an old replay's mods and stats with the score's", async () => {
        const broker = new FakeBrokerClient(undefined, () => ({
            ok: true,
            value: replayPerformanceBody(5),
        }));

        await new ScoreCalculator(broker).calculateReplay(
            "v",
            Buffer.from("odr"),
            {
                overrides: scoreRow({
                    mods: JSON.stringify([new ModDoubleTime().serialize()]),
                }),
            },
        );

        expect(broker.calls[0]).toMatchObject({
            request: {
                mods: [new ModDoubleTime().serialize()],
                score: {
                    n300: 400,
                    n100: 20,
                    n50: 2,
                    nmiss: 1,
                    combo: 500,
                    sliderHeadHits: 100,
                    sliderTickHits: 200,
                    sliderRepeatHits: 10,
                    sliderEndHits: 99,
                },
            },
        });
        // Old replays never carried a total score, so none is sent.
        const call = broker.calls[0];
        expect(
            call?.kind === "replay" && call.request.score,
        ).not.toHaveProperty("totalScore");
    });

    it("calculates the no-penalty total from a resolved score", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(120),
        }));
        const earlier = performanceBody(100, {
            difficulty: { mods: [new ModHardRock().serialize()] },
            score: {
                n300: 9,
                n100: 1,
                n50: 0,
                nmiss: 0,
                combo: 30,
                sliderTicksMissed: 2,
                sliderEndsDropped: 1,
                totalScore: 5000,
                tapPenalty: 1.5,
                sliderCheesePenalty: 0.9,
            },
        });

        expect(
            await new ScoreCalculator(broker).noPenaltyTotal(
                "v",
                testHash,
                earlier,
            ),
        ).toEqual({ ok: true, value: 120 });
        expect(broker.calls[0]).toEqual({
            kind: "performance",
            variant: "v",
            request: {
                beatmap: { hash: testHash },
                mods: [new ModHardRock().serialize()],
                score: {
                    n300: 9,
                    n100: 1,
                    n50: 0,
                    nmiss: 0,
                    combo: 30,
                    sliderTicksMissed: 2,
                    sliderEndsDropped: 1,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
            },
        });
    });

    it("passes broker failures through", async () => {
        const failure = {
            ok: false,
            kind: "retry",
            status: 503,
            code: "VARIANT_UNAVAILABLE",
            message: "m",
        } as const;
        const broker = new FakeBrokerClient(() => failure);

        expect(
            await new ScoreCalculator(broker).calculateStats("v", scoreRow()),
        ).toEqual(failure);
    });
});
