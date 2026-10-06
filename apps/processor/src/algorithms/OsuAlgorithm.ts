import { Modes } from "@rian8337/osu-base";
import {
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IOsuDifficultyAttributes,
    type IOsuPerformanceAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { BaseAlgorithm } from "./BaseAlgorithm";

/**
 * The osu!standard algorithm.
 */
export class OsuAlgorithm extends BaseAlgorithm<
    IOsuDifficultyAttributes,
    IOsuPerformanceAttributes
> {
    readonly mode = Modes.Osu;
    protected readonly difficultyCalculator = new OsuDifficultyCalculator();

    protected calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<IOsuDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): IOsuPerformanceAttributes {
        return new OsuPerformanceCalculator(difficulty).calculate(options);
    }
}
