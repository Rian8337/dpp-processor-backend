import type { ScoreParameters } from "@dpp/shared";
import { Modes, type Beatmap } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDroidPerformanceAttributes,
    type IExtendedDroidDifficultyAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    RebalanceThreeFingerChecker,
    ReplayAnalyzer,
    ThreeFingerChecker,
} from "@rian8337/osu-droid-replay-analyzer";
import {
    BaseAlgorithm,
    type AnalyzerDifficultyAttributes,
} from "./BaseAlgorithm";

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

    protected createReplayAnalyzer(
        beatmap: Beatmap,
        attributes: AnalyzerDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
    ): ReplayAnalyzer {
        return new ReplayAnalyzer({
            map: beatmap,
            difficultyAttributes: attributes,
        });
    }

    /**
     * Applies the three-finger (tap) and slider cheese penalties. The replay analyzer picks the live or rebalance
     * checks from the attributes' `mode` tag, which the calculator that produced them sets.
     */
    protected override applyReplayPenalties(
        analyzer: ReplayAnalyzer,
        attributes: AnalyzerDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        score: ScoreParameters,
    ): void {
        // Type-checking uses the live package, whose `mode` is always "live"; a rebalance build bundles the
        // rebalance calculator instead, so the runtime value can differ.
        const threeFingerChecker =
            attributes.mode === "live"
                ? ThreeFingerChecker
                : RebalanceThreeFingerChecker;

        if (threeFingerChecker.isEligibleToDetect(attributes)) {
            analyzer.checkFor3Finger();
            score.tapPenalty = analyzer.tapPenalty;
        }

        if (attributes.difficultSliders.length > 0) {
            analyzer.checkForSliderCheesing();
            score.sliderCheesePenalty = analyzer.sliderCheesePenalty;
        }
    }
}
