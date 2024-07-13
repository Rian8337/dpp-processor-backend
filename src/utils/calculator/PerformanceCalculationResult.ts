import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { IPerformanceCalculationResult } from "../../structures/calculator/IPerformanceCalculationResult";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ReplayAttributes } from "../../structures/attributes/ReplayAttributes";
import { If } from "@rian8337/osu-base";

/**
 * Represents a beatmap's performance calculation result.
 */
export class PerformanceCalculationResult<
    TDiffAttributes extends DifficultyAttributes,
    TPerfAttributes extends PerformanceAttributes,
    THasStrainChart extends boolean = boolean,
> implements
        IPerformanceCalculationResult<
            TDiffAttributes,
            TPerfAttributes,
            THasStrainChart
        >
{
    readonly params: PerformanceCalculationParameters;
    readonly difficultyAttributes: TDiffAttributes;
    readonly result: TPerfAttributes;
    readonly replay?: ReplayAttributes;
    readonly strainChart: If<THasStrainChart, Buffer>;

    constructor(
        params: PerformanceCalculationParameters,
        difficultyAttributes: TDiffAttributes,
        result: TPerfAttributes,
        replay?: ReplayAttributes,
        strainChart?: Buffer,
    ) {
        this.params = params;
        this.difficultyAttributes = difficultyAttributes;
        this.result = result;
        this.replay = replay;
        this.strainChart = (strainChart ?? null) as If<THasStrainChart, Buffer>;
    }

    hasStrainChart(): this is IPerformanceCalculationResult<
        TDiffAttributes,
        TPerfAttributes,
        true
    > {
        return this.strainChart !== null;
    }
}
