import { CalculationParameters, CalculationResult } from "@/calculations";
import { IScore } from "@/database/official/schema";
import {
    EitherOperationResult,
    PerformanceAttributes,
    RawDifficultyAttributes,
} from "@/types";
import { Score } from "@rian8337/osu-droid-utilities";

/**
 * Provides calculation-related operations.
 *
 * @template TDifficultyAttributes The type of difficulty attributes.
 * @template TPerformanceAttributes The type of performance attributes.
 */
export interface ICalculationService<
    TDifficultyAttributes extends RawDifficultyAttributes,
    TPerformanceAttributes extends PerformanceAttributes,
> {
    /**
     * Calculates the difficulty and performance of a beatmap.
     *
     * @param beatmapIdOrHash The ID or MD5 hash of the beatmap.
     * @param parameters The calculation parameters to use.
     * @param generateStrainChart Whether to generate a strain chart. Defaults to `false`.
     * @returns The calculation result.
     */
    calculateBeatmap<THasStrainChart extends boolean = false>(
        beatmapIdOrHash: number | string,
        parameters: CalculationParameters,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    >;

    /**
     * Calculates the difficulty and performance of a beatmap.
     *
     * @param beatmapFile The beatmap file.
     * @param parameters The calculation parameters to use.
     * @param generateStrainChart Whether to generate a strain chart. Defaults to `false`.
     * @returns The calculation result.
     */
    calculateBeatmapFile<THasStrainChart extends boolean = false>(
        beatmapFile: Buffer,
        parameters: CalculationParameters,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    >;

    /**
     * Calculates the performance for a score.
     *
     * @param score The score to calculate the performance for.
     * @param useBestPPReplay Whether to use the best performance points (PP) replay for the score.
     * @param generateStrainChart Whether to generate a strain chart. Defaults to `false`.
     * @returns The calculation result.
     */
    calculateScore<THasStrainChart extends boolean = false>(
        score: Score | IScore,
        useBestPPReplay: boolean,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    >;
}
