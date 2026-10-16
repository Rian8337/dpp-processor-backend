import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { DroidAlgorithm } from "@/algorithms/DroidAlgorithm";
import { AlgorithmInputError } from "@/algorithms/errors";
import { OsuAlgorithm } from "@/algorithms/OsuAlgorithm";
import type { Algorithm } from "@/algorithms/types";
import {
    Accuracy,
    BeatmapDecoder,
    ModDoubleTime,
    ModHidden,
    ModNoFail,
    Modes,
    type Beatmap,
    type ModMap,
} from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDifficultyAttributes,
    type IPerformanceAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { readBeatmapFixture } from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

interface AlgorithmCase<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
> {
    readonly algorithm: Algorithm<TAttributes, TPerformance>;
    readonly expectedDifficulty: (
        beatmap: Beatmap,
        mods: ModMap,
    ) => CacheableDifficultyAttributes<TAttributes>;
    readonly expectedPerformance: (
        attributes: CacheableDifficultyAttributes<TAttributes>,
        options: PerformanceCalculationOptions,
    ) => TPerformance;
}

/**
 * Checks that an algorithm produces exactly what calling the calculator directly produces.
 */
function describeAlgorithm<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
>(testCase: AlgorithmCase<TAttributes, TPerformance>) {
    const { algorithm, expectedDifficulty, expectedPerformance } = testCase;
    const osuFile = readBeatmapFixture("loveLetter");
    const mods = modMap(new ModHidden(), new ModDoubleTime());

    describe(`${algorithm.mode} algorithm`, () => {
        it("decodes beatmaps for its mode", () => {
            expect(
                algorithm.decodeBeatmap(osuFile).hitObjects.objects.length,
            ).toBe(
                new BeatmapDecoder().decode(osuFile, algorithm.mode).result
                    .hitObjects.objects.length,
            );
        });

        it("calculates the same difficulty attributes as the calculator", () => {
            const expected = expectedDifficulty(
                new BeatmapDecoder().decode(osuFile, algorithm.mode).result,
                mods,
            );

            expect(
                algorithm.calculateDifficulty(
                    algorithm.decodeBeatmap(osuFile),
                    mods,
                ),
            ).toEqual(expected);
        });

        it("calculates the same performance attributes as the calculator", () => {
            const attributes = algorithm.calculateDifficulty(
                algorithm.decodeBeatmap(osuFile),
                mods,
            );
            const objectCount =
                attributes.hitCircleCount +
                attributes.sliderCount +
                attributes.spinnerCount;

            const expected = expectedPerformance(attributes, {
                combo: attributes.maxCombo - 10,
                accPercent: new Accuracy({
                    n300: objectCount - 3,
                    n100: 2,
                    n50: 0,
                    nmiss: 1,
                }),
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            });

            const result = algorithm.calculatePerformance(attributes, {
                combo: attributes.maxCombo - 10,
                n100: 2,
                nmiss: 1,
            });

            expect(result.performance).toEqual(expected);
            expect(result.score).toMatchObject({
                n300: objectCount - 3,
                n100: 2,
                nmiss: 1,
            });
        });

        it("keeps only difficulty-adjusting mods", () => {
            const retained = algorithm.retainDifficultyAdjustmentMods(
                modMap(new ModNoFail(), new ModHidden(), new ModDoubleTime()),
            );

            expect(retained).toEqual(
                modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
            );
        });

        it("calculates strain peaks", () => {
            const peaks = algorithm.calculateStrainPeaks(
                algorithm.decodeBeatmap(osuFile),
                mods,
            );

            expect(peaks.aimWithSliders.length).toBeGreaterThan(0);
        });

        it("rejects a beatmap without hit objects", () => {
            expect(() => algorithm.decodeBeatmap("not a beatmap")).toThrow(
                AlgorithmInputError,
            );
        });
    });
}

describeAlgorithm({
    algorithm: new DroidAlgorithm(),
    expectedDifficulty: (beatmap, mods) =>
        new DroidDifficultyCalculator()
            .calculate(beatmap, mods)
            .toCacheableAttributes(),
    expectedPerformance: (attributes, options) =>
        new DroidPerformanceCalculator(attributes).calculate(options),
});

describeAlgorithm({
    algorithm: new OsuAlgorithm(),
    expectedDifficulty: (beatmap, mods) =>
        new OsuDifficultyCalculator()
            .calculate(beatmap, mods)
            .toCacheableAttributes(),
    expectedPerformance: (attributes, options) =>
        new OsuPerformanceCalculator(attributes).calculate(options),
});

describe("createAlgorithm", () => {
    it.each([
        [Modes.Droid, DroidAlgorithm],
        [Modes.Osu, OsuAlgorithm],
    ])("creates the %s algorithm", (mode, type) => {
        const algorithm = createAlgorithm(mode);

        expect(algorithm).toBeInstanceOf(type);
        expect(algorithm.mode).toBe(mode);
    });
});
