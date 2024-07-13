import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { PerformanceCalculationParameters } from "../../utils/calculator/PerformanceCalculationParameters";
import { PerformanceAttributes } from "../attributes/PerformanceAttributes";
import { ReplayAttributes } from "../attributes/ReplayAttributes";
import { If } from "@rian8337/osu-base";

/**
 * A structure for implementing performance calculation results.
 */
export interface IPerformanceCalculationResult<
    TDiffAttributes extends DifficultyAttributes,
    TPerfAttributes extends PerformanceAttributes,
    THasStrainChart extends boolean = boolean,
> {
    /**
     * The calculation parameters.
     */
    readonly params: PerformanceCalculationParameters;

    /**
     * The difficulty attributes that were calculated.
     */
    readonly difficultyAttributes: TDiffAttributes;

    /**
     * The performance of the beatmap.
     */
    readonly result: TPerfAttributes;

    /**
     * The attributes of the calculated replay, if any.
     */
    readonly replay?: ReplayAttributes;

    /**
     * The strain chart in binary data, if any.
     */
    readonly strainChart: If<THasStrainChart, Buffer>;

    /**
     * Checks if the calculation result has a strain chart.
     */
    hasStrainChart(): this is IPerformanceCalculationResult<
        TDiffAttributes,
        TPerfAttributes,
        true
    >;
}
