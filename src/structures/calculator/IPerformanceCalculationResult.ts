import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { PerformanceCalculationParameters } from "../../utils/calculator/PerformanceCalculationParameters";
import { PerformanceAttributes } from "../attributes/PerformanceAttributes";
import { ReplayAttributes } from "../attributes/ReplayAttributes";

/**
 * A structure for implementing performance calculation results.
 */
export interface IPerformanceCalculationResult<
    TDiffAttributes extends DifficultyAttributes,
    TPerfAttributes extends PerformanceAttributes
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
}
