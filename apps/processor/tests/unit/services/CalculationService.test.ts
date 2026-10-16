import { createAlgorithm } from "@/algorithms/createAlgorithm";
import type {
    Algorithm,
    ReplayAnalysis,
    ReplayHeader,
} from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { VariantManifest } from "@/manifest/manifest";
import { BeatmapService } from "@/services/BeatmapService";
import { CalculationService } from "@/services/CalculationService";
import { DifficultyCacheService } from "@/services/DifficultyCacheService";
import {
    CalculationFailedError,
    UnprocessableEntityError,
} from "@/types/errors";
import { BadRequestError } from "@dpp/server";
import { ModHidden, Modes } from "@rian8337/osu-base";
import { FixtureBeatmapServiceClient } from "@test/utils/beatmaps";
import {
    beatmapFixtures,
    md5Of,
    readBeatmapFixture,
} from "@test/utils/fixtures";
import { describe, expect, it, vi } from "vitest";

function createService(
    mode: Modes,
    configure: (runner: InlineRunner) => void = () => undefined,
    configureAlgorithm: (algorithm: Algorithm) => void = () => undefined,
) {
    const algorithm = createAlgorithm(mode);
    configureAlgorithm(algorithm);
    const runner = new InlineRunner(algorithm);
    configure(runner);

    const manifest: VariantManifest = {
        id: `test-${mode}`,
        mode,
        algorithm: "live",
        calculatorVersion: "0123456789abcdef",
        source: "npm",
        builtAt: "2026-10-05T00:00:00.000Z",
    };

    const repository = {
        find: () => Promise.resolve(null),
        insert: () => Promise.resolve(),
        deleteOtherVersions: () => Promise.resolve(0),
    };

    const beatmaps = new BeatmapService(new FixtureBeatmapServiceClient());
    const cache = new DifficultyCacheService(
        algorithm,
        manifest,
        repository,
        runner,
    );

    return new CalculationService(algorithm, manifest, beatmaps, cache, runner);
}

const loveLetter = { id: beatmapFixtures.loveLetter.id };
const loveLetterHash = md5Of(Buffer.from(readBeatmapFixture("loveLetter")));

describe("slider hit counts", () => {
    async function counts() {
        const runner = new InlineRunner(createAlgorithm(Modes.Droid));

        return runner.countSliderObjects({
            beatmapHash: loveLetterHash,
            osuFile: readBeatmapFixture("loveLetter"),
        });
    }

    it("converts hit counts and reports the converted misses", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        const response = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {
                sliderHeadHits: total.sliders - 1,
                sliderTickHits: total.ticks - 2,
                sliderRepeatHits: total.repeats,
                sliderEndHits: total.sliderEnds - 1,
            },
            strainChart: false,
        });

        expect(response.score.sliderTicksMissed).toBe(3);
        expect(response.score.sliderEndsDropped).toBe(1);
    });

    it("gives the same result as the equivalent miss counts", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        const fromHits = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {
                sliderHeadHits: total.sliders,
                sliderTickHits: total.ticks - 1,
                sliderRepeatHits: total.repeats,
                sliderEndHits: total.sliderEnds,
            },
            strainChart: false,
        });
        const fromMisses = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: { sliderTicksMissed: 1, sliderEndsDropped: 0 },
            strainChart: false,
        });

        expect(fromHits.performance).toEqual(fromMisses.performance);
    });

    it("rejects hit counts above the beatmap's totals", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        await expect(
            service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score: {
                    sliderHeadHits: total.sliders + 1,
                    sliderTickHits: 0,
                    sliderRepeatHits: 0,
                    sliderEndHits: 0,
                },
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("counts each beatmap's slider objects once", async () => {
        let runner!: InlineRunner;
        const service = createService(Modes.Droid, (created) => {
            runner = created;
            vi.spyOn(created, "countSliderObjects");
        });
        const score = {
            sliderHeadHits: 0,
            sliderTickHits: 0,
            sliderRepeatHits: 0,
            sliderEndHits: 0,
        };

        await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score,
            strainChart: false,
        });
        await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score,
            strainChart: false,
        });

        expect(runner.countSliderObjects).toHaveBeenCalledTimes(1);
    });

    it("replaces a replay's own slider misses with converted hit counts", async () => {
        const total = await counts();
        const service = createService(Modes.Droid, (runner) => {
            runner.readReplay = vi.fn<ICalculationRunner["readReplay"]>(() =>
                Promise.resolve({
                    beatmapHash: loveLetterHash,
                    mods: [new ModHidden().serialize()],
                }),
            );
            runner.analyzeReplay = vi.fn<ICalculationRunner["analyzeReplay"]>(
                () =>
                    Promise.resolve({
                        score: {
                            n300: 590,
                            nmiss: 0,
                            combo: 700,
                            sliderTicksMissed: 5,
                            sliderEndsDropped: 4,
                        },
                        replay: {
                            hitError: null,
                            sliderTickInformation: null,
                            sliderEndInformation: null,
                        },
                    }),
            );
        });

        const response = await service.calculateReplayPerformance({
            replay: "AAEC",
            score: {
                sliderHeadHits: total.sliders,
                sliderTickHits: total.ticks,
                sliderRepeatHits: total.repeats,
                sliderEndHits: total.sliderEnds,
            },
            strainChart: false,
        });

        expect(response.score.sliderTicksMissed).toBe(0);
        expect(response.score.sliderEndsDropped).toBe(0);
    });
});

describe("CalculationService", () => {
    it("returns difficulty attributes carrying the requested mods", async () => {
        const service = createService(Modes.Droid);
        const mods = [{ acronym: "NF" }, { acronym: "HD" }];
        const response = await service.calculateDifficulty({
            beatmap: loveLetter,
            mods,
            strainChart: false,
        });

        expect(response.difficulty.mods).toEqual(mods);
        expect(response.difficulty.starRating).toBeGreaterThan(0);
        expect(response.strainChart).toBeUndefined();
    });

    it.each([Modes.Droid, Modes.Osu])(
        "applies NoFail to %s performance even though difficulty is shared",
        async (mode) => {
            const service = createService(mode);
            const score = { nmiss: 5 };

            const plain = await service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score,
                strainChart: false,
            });
            const noFail = await service.calculatePerformance({
                beatmap: loveLetter,
                mods: [{ acronym: "NF" }],
                score,
                strainChart: false,
            });

            expect(noFail.difficulty.starRating).toBe(
                plain.difficulty.starRating,
            );
            expect(noFail.performance.total).toBeLessThan(
                plain.performance.total,
            );
        },
    );

    it("rejects unknown and duplicate mods", async () => {
        const service = createService(Modes.Droid);

        await expect(
            service.calculateDifficulty({
                beatmap: loveLetter,
                mods: [{ acronym: "ZZ" }],
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);

        await expect(
            service.calculateDifficulty({
                beatmap: loveLetter,
                mods: [{ acronym: "HD" }, { acronym: "HD" }],
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("reports an unexpected calculator failure as CALCULATION_FAILED", async () => {
        const error = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const service = createService(Modes.Droid, undefined, (algorithm) => {
            vi.spyOn(algorithm, "calculatePerformance").mockImplementation(
                () => {
                    throw new RangeError("calculator blew up");
                },
            );
        });

        const failure = service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {},
            strainChart: false,
        });

        await expect(failure).rejects.toBeInstanceOf(CalculationFailedError);
        await expect(failure).rejects.toMatchObject({
            statusCode: 500,
            code: "CALCULATION_FAILED",
            message: "calculator blew up",
        });
        expect(error).toHaveBeenCalledWith(
            "Performance calculation failed:",
            expect.any(RangeError),
        );
    });

    it.each([
        [[{ acronym: "ZZ" }], /unknown mods: ZZ/],
        [[{ acronym: "HD" }, { acronym: "HD" }], /duplicate mods: HD/],
        [[{ acronym: "DT" }, { acronym: "HT" }], /incompatible mods: DT, HT/],
    ])("explains why mods %j are rejected", async (mods, message) => {
        const service = createService(Modes.Droid);

        const failure = service.calculateDifficulty({
            beatmap: loveLetter,
            mods,
            strainChart: false,
        });

        await expect(failure).rejects.toBeInstanceOf(BadRequestError);
        await expect(failure).rejects.toThrow(message);
    });

    it("rejects hit counts above the object count", async () => {
        const service = createService(Modes.Droid);

        await expect(
            service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score: { n300: 100_000 },
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("renders a requested strain chart as base64 PNG", async () => {
        const service = createService(Modes.Osu);
        const response = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {},
            strainChart: true,
        });

        expect(
            Buffer.from(response.strainChart ?? "", "base64")
                .subarray(1, 4)
                .toString(),
        ).toBe("PNG");
    });

    it("calculates uploaded beatmaps", async () => {
        const service = createService(Modes.Droid);
        const byId = await service.calculateDifficulty({
            beatmap: loveLetter,
            mods: [],
            strainChart: false,
        });
        const uploaded = await service.calculateDifficulty({
            beatmap: { file: readBeatmapFixture("loveLetter") },
            mods: [],
            strainChart: false,
        });

        expect(uploaded.difficulty.starRating).toBe(byId.difficulty.starRating);
    });

    describe("replays", () => {
        const readReplay = (header: ReplayHeader) =>
            vi.fn<ICalculationRunner["readReplay"]>(() =>
                Promise.resolve(header),
            );

        const analysis: ReplayAnalysis = {
            score: {
                n300: 590,
                n100: 2,
                n50: 0,
                nmiss: 0,
                combo: 700,
                tapPenalty: 1.1,
            },
            replay: {
                hitError: null,
                sliderTickInformation: null,
                sliderEndInformation: null,
            },
        };

        it("requires mods for replays that do not record them", async () => {
            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: null,
                });
            });

            const result = service.calculateReplayPerformance({
                replay: "AAEC",
                strainChart: false,
            });

            await expect(result).rejects.toBeInstanceOf(
                UnprocessableEntityError,
            );
            await expect(result).rejects.toMatchObject({
                code: "INVALID_REPLAY",
            });
        });

        it("uses the replay's own mods by default", async () => {
            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: [{ acronym: "HD" }],
                });
                runner.analyzeReplay = vi.fn<
                    ICalculationRunner["analyzeReplay"]
                >(() => Promise.resolve(analysis));
            });

            const response = await service.calculateReplayPerformance({
                replay: "AAEC",
                strainChart: false,
            });

            expect(response.difficulty.mods).toEqual([{ acronym: "HD" }]);
            expect(response.score).toMatchObject({
                n300: 590,
                n100: 2,
                combo: 700,
                tapPenalty: 1.1,
            });
            expect(response.replay).toEqual(analysis.replay);
        });

        it("lets request mods and score override replay-derived values", async () => {
            const analyzeReplay = vi.fn<ICalculationRunner["analyzeReplay"]>(
                () => Promise.resolve(analysis),
            );

            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: [{ acronym: "HD" }],
                });
                runner.analyzeReplay = analyzeReplay;
            });

            const response = await service.calculateReplayPerformance({
                replay: "AAEC",
                mods: [{ acronym: "HR" }],
                score: { combo: 100 },
                strainChart: false,
            });

            expect(response.difficulty.mods).toEqual([{ acronym: "HR" }]);
            expect(response.score).toMatchObject({
                n300: 590,
                combo: 100,
                tapPenalty: 1.1,
            });
            // The analysis must see the mods the score is calculated with.
            expect(analyzeReplay.mock.calls[0]?.[0].difficulty.mods).toEqual([
                { acronym: "HR" },
            ]);
        });
    });
});
