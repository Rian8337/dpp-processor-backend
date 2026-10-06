import { Modes } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDroidPerformanceAttributes,
    type IExtendedDroidDifficultyAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { BaseAlgorithm } from "./BaseAlgorithm";

/**
 * The osu!droid algorithm.
 */
export class DroidAlgorithm extends BaseAlgorithm<
    IExtendedDroidDifficultyAttributes,
    IDroidPerformanceAttributes
> {
    readonly mode = Modes.Droid;
    protected readonly difficultyCalculator = new DroidDifficultyCalculator();

    protected calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): IDroidPerformanceAttributes {
        return new DroidPerformanceCalculator(difficulty).calculate(options);
    }
}
