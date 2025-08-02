import {
    PerformanceAttributes,
    RawDifficultyAttributes,
    ReplayAttributes,
} from "@/types";
import { If } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { CalculationParameters } from "./CalculationParameters";

/**
 * Represents a beatmap's performance calculation result.
 *
 * @template TDifficultyAttributes The type of the difficulty attributes.
 * @template TPerformanceAttributes The type of the performance attributes.
 * @template THasStrainChart Indicates if the result includes a strain chart.
 */
export class CalculationResult<
    TDifficultyAttributes extends RawDifficultyAttributes,
    TPerformanceAttributes extends PerformanceAttributes,
    THasStrainChart extends boolean = boolean,
> {
    /**
     * The calculation parameters.
     */
    readonly parameters: CalculationParameters;

    /**
     * The difficulty attributes that were calculated.
     */
    readonly difficultyAttributes: CacheableDifficultyAttributes<TDifficultyAttributes>;

    /**
     * The performance attributes of the beatmap.
     */
    readonly performanceAttributes: TPerformanceAttributes;

    /**
     * The attributes of the calculated replay, if any.
     */
    readonly replayAttributes?: ReplayAttributes;

    /**
     * The strain chart in binary data, if any.
     */
    readonly strainChart: If<THasStrainChart, Buffer>;

    constructor(
        parameters: CalculationParameters,
        difficultyAttributes: CacheableDifficultyAttributes<TDifficultyAttributes>,
        performanceAttributes: TPerformanceAttributes,
        replayAttributes?: ReplayAttributes,
        strainChart?: Buffer,
    ) {
        this.parameters = parameters;
        this.difficultyAttributes = difficultyAttributes;
        this.performanceAttributes = performanceAttributes;
        this.replayAttributes = replayAttributes;
        this.strainChart = (strainChart ?? null) as If<THasStrainChart, Buffer>;
    }

    /**
     * Checks if the calculation result has a strain chart.
     */
    hasStrainChart(): this is CalculationResult<
        TDifficultyAttributes,
        TPerformanceAttributes,
        true
    > {
        return this.strainChart !== null;
    }
}
