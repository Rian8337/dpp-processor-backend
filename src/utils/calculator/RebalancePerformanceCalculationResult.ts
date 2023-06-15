import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { IPerformanceCalculationResult } from "../../structures/calculator/IPerformanceCalculationResult";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ReplayAttributes } from "../../structures/attributes/ReplayAttributes";

/**
 * Represents a beatmap's performance calculation result.
 */
export class RebalancePerformanceCalculationResult<
    TDiffAttributes extends DifficultyAttributes,
    TPerfAttributes extends PerformanceAttributes
> implements IPerformanceCalculationResult<TDiffAttributes, TPerfAttributes>
{
    readonly params: PerformanceCalculationParameters;
    readonly difficultyAttributes: TDiffAttributes;
    readonly result: TPerfAttributes;
    readonly replay?: ReplayAttributes;

    constructor(
        params: PerformanceCalculationParameters,
        difficultyAttributes: TDiffAttributes,
        result: TPerfAttributes,
        replay?: ReplayAttributes
    ) {
        this.params = params;
        this.difficultyAttributes = difficultyAttributes;
        this.result = result;
        this.replay = replay;
    }
}
