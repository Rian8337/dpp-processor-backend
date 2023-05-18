import {
    DifficultyCalculator as RebalanceDifficultyCalculator,
    PerformanceCalculator as RebalancePerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { IPerformanceCalculationResult } from "../../structures/calculator/IPerformanceCalculationResult";

/**
 * Represents a beatmap's performance calculation result.
 */
export class RebalancePerformanceCalculationResult<
    D extends RebalanceDifficultyCalculator,
    P extends RebalancePerformanceCalculator
> implements IPerformanceCalculationResult<D, P>
{
    readonly params: PerformanceCalculationParameters;
    readonly result: P;
    readonly difficultyCalculator?: D;

    constructor(
        params: PerformanceCalculationParameters,
        result: P,
        difficultyCalculator?: D
    ) {
        this.params = params;
        this.result = result;
        this.difficultyCalculator = difficultyCalculator;
    }

    requestedDifficultyCalculation(): this is this & {
        readonly difficultyCalculator: D;
    } {
        return this.difficultyCalculator !== undefined;
    }
}
