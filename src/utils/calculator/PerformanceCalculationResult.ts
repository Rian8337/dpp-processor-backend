import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { IPerformanceCalculationResult } from "../../structures/calculator/IPerformanceCalculationResult";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";

/**
 * Represents a beatmap's performance calculation result.
 */
export class PerformanceCalculationResult<
    TDiffAttributes extends DifficultyAttributes,
    TPerfAttributes extends PerformanceAttributes
> implements IPerformanceCalculationResult<TDiffAttributes, TPerfAttributes>
{
    readonly params: PerformanceCalculationParameters;
    readonly difficultyAttributes: TDiffAttributes;
    readonly result: TPerfAttributes;

    constructor(
        params: PerformanceCalculationParameters,
        difficultyAttributes: TDiffAttributes,
        result: TPerfAttributes
    ) {
        this.params = params;
        this.difficultyAttributes = difficultyAttributes;
        this.result = result;
    }
}
