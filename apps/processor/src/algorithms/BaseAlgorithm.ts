import type { ScoreParameters } from "@dpp/shared";
import {
    BeatmapDecoder,
    ModUtil,
    type Beatmap,
    type ModMap,
    type Modes,
    type PlayableBeatmap,
    type SerializedMod,
} from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
    DifficultyCalculator,
    DifficultyHitObject,
    IDifficultyAttributes,
    IPerformanceAttributes,
    PerformanceCalculationOptions,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";
import { AlgorithmInputError } from "./errors";
import { resolveScore, toCalculationOptions } from "./score";
import type { Algorithm, PerformanceResult } from "./types";

/**
 * Calculator logic shared by all modes.
 *
 * @template TAttributes The difficulty attributes the mode's difficulty calculator produces.
 * @template TPerformance The performance attributes the mode's performance calculator produces.
 */
export abstract class BaseAlgorithm<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
> implements Algorithm<TAttributes, TPerformance> {
    abstract readonly mode: Modes;

    protected abstract readonly difficultyCalculator: DifficultyCalculator<
        PlayableBeatmap,
        DifficultyHitObject,
        DifficultyAttributes & TAttributes
    >;

    /**
     * Runs the mode's performance calculator.
     */
    protected abstract calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        options: PerformanceCalculationOptions,
    ): TPerformance;

    decodeBeatmap(osuFile: string): Beatmap {
        let beatmap: Beatmap;

        try {
            beatmap = new BeatmapDecoder().decode(osuFile, this.mode).result;
        } catch (e) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                e instanceof Error ? e.message : "Beatmap could not be decoded",
            );
        }

        if (beatmap.hitObjects.objects.length === 0) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                "Beatmap has no hit objects",
            );
        }

        return beatmap;
    }

    retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[] {
        return ModUtil.serializeMods(
            this.difficultyCalculator.retainDifficultyAdjustmentMods([
                ...mods.values(),
            ]),
        );
    }

    calculateDifficulty(
        beatmap: Beatmap,
        mods: ModMap,
    ): CacheableDifficultyAttributes<TAttributes> {
        return this.difficultyCalculator
            .calculate(beatmap, mods)
            .toCacheableAttributes();
    }

    calculatePerformance(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        score: ScoreParameters,
    ): PerformanceResult<TPerformance> {
        // The attributes carry maxCombo and the object counts; droid attributes also carry maximumScore.
        const resolved = resolveScore(difficulty, score);

        return {
            performance: this.calculatePerformanceAttributes(
                difficulty,
                toCalculationOptions(resolved),
            ),
            score: resolved,
        };
    }

    calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks {
        return this.difficultyCalculator.calculateStrainPeaks(beatmap, mods);
    }
}
