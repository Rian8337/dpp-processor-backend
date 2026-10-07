import { Modes, type Beatmap } from "@rian8337/osu-base";
import {
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IOsuDifficultyAttributes,
    type IOsuPerformanceAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BaseAlgorithm, type AnalyzerDifficultyAttributes } from "./BaseAlgorithm";

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

    protected createReplayAnalyzer(
        beatmap: Beatmap,
        attributes: AnalyzerDifficultyAttributes<IOsuDifficultyAttributes>,
    ): ReplayAnalyzer {
        return new ReplayAnalyzer({
            map: beatmap,
            // The analyzer's typings only accept droid attributes, but for osu it reads nothing from them except
            // `mods` (hit windows), which osu attributes carry too.
            difficultyAttributes:
                attributes as unknown as ReplayAnalyzer["difficultyAttributes"],
        });
    }
}
