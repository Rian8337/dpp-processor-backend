import { createAlgorithm } from "@/algorithms/createAlgorithm";
import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { VariantManifest } from "@/manifest/manifest";
import { BeatmapService } from "@/services/BeatmapService";
import { CalculationService } from "@/services/CalculationService";
import { DifficultyCacheService } from "@/services/DifficultyCacheService";
import { BadRequestError, UnprocessableEntityError } from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
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
) {
    const algorithm = createAlgorithm(mode);
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
                tapPenalty: 0.9,
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
                tapPenalty: 0.9,
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
                tapPenalty: 0.9,
            });
            // The analysis must see the mods the score is calculated with.
            expect(analyzeReplay.mock.calls[0]?.[0].difficulty.mods).toEqual([
                { acronym: "HR" },
            ]);
        });
    });
});
