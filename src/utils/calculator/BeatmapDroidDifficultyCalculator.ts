import { BeatmapDifficultyCalculator } from "./BeatmapDifficultyCalculator";
import {
    DroidDifficultyAttributes,
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    ReplayAnalyzer,
    ThreeFingerChecker,
} from "@rian8337/osu-droid-replay-analyzer";
import {
    liveDroidDifficultyCache,
    rebalanceDroidDifficultyCache,
} from "../cache/difficultyAtributesStorage";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { PerformanceCalculationResult } from "./PerformanceCalculationResult";
import { RebalancePerformanceCalculationResult } from "./RebalancePerformanceCalculationResult";
import { getBeatmap } from "../cache/beatmapStorage";

/**
 * A helper class for calculating osu!droid difficulty and performance of beatmaps or scores.
 */
export class BeatmapDroidDifficultyCalculator extends BeatmapDifficultyCalculator<
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    RebalanceDroidDifficultyCalculator,
    RebalanceDroidPerformanceCalculator,
    DroidDifficultyAttributes,
    RebalanceDroidDifficultyAttributes
> {
    protected override readonly difficultyCalculator =
        DroidDifficultyCalculator;
    protected override readonly rebalanceDifficultyCalculator =
        RebalanceDroidDifficultyCalculator;
    protected override readonly performanceCalculator =
        DroidPerformanceCalculator;
    protected override readonly rebalancePerformanceCalculator =
        RebalanceDroidPerformanceCalculator;
    protected override readonly liveDifficultyAttributesCache =
        liveDroidDifficultyCache;
    protected override readonly rebalanceDifficultyAttributesCache =
        rebalanceDroidDifficultyCache;

    /**
     * Applies a tap penalty to a calculation result.
     *
     * @param replay The replay associated with the calculation result.
     * @param calcResult The calculation result to apply the tap penalty to.
     * @returns Whether the operation was successful.
     */
    static async applyTapPenalty(
        replay: ReplayAnalyzer,
        calcResult:
            | PerformanceCalculationResult<
                  DroidDifficultyCalculator,
                  DroidPerformanceCalculator
              >
            | RebalancePerformanceCalculationResult<
                  RebalanceDroidDifficultyCalculator,
                  RebalanceDroidPerformanceCalculator
              >
    ): Promise<boolean> {
        if (!replay.data) {
            return false;
        }

        const difficultyAttributes = <
            | ExtendedDroidDifficultyAttributes
            | RebalanceExtendedDroidDifficultyAttributes
        >calcResult.result.difficultyAttributes;
        if (!ThreeFingerChecker.isEligibleToDetect(difficultyAttributes)) {
            return false;
        }

        if (!replay.hasBeenCheckedFor3Finger) {
            const beatmap = await getBeatmap(replay.data.hash);
            if (!beatmap) {
                return false;
            }

            replay.beatmap ??= beatmap.beatmap;
            replay.difficultyAttributes = difficultyAttributes;
            replay.checkFor3Finger();
            calcResult.params.tapPenalty = replay.tapPenalty;
        }

        calcResult.result.applyTapPenalty(replay.tapPenalty);

        return true;
    }

    /**
     * Applies aim penalty to a replay.
     *
     * @param replay The replay.
     * @param difficultyCalculator The difficulty calculator of the replay.
     * @returns The performance calculation result.
     */
    static async applyAimPenalty(
        replay: ReplayAnalyzer,
        difficultyCalculator: DroidDifficultyCalculator
    ): Promise<
        PerformanceCalculationResult<
            DroidDifficultyCalculator,
            DroidPerformanceCalculator
        >
    >;

    /**
     * Applies aim penalty to a replay.
     *
     * @param replay The replay.
     * @param difficultyCalculator The difficulty calculator of the replay.
     * @returns The performance calculation result.
     */
    static async applyAimPenalty(
        replay: ReplayAnalyzer,
        difficultyCalculator: RebalanceDroidDifficultyCalculator
    ): Promise<
        RebalancePerformanceCalculationResult<
            RebalanceDroidDifficultyCalculator,
            RebalanceDroidPerformanceCalculator
        >
    >;

    static async applyAimPenalty(
        replay: ReplayAnalyzer,
        difficultyCalculator:
            | DroidDifficultyCalculator
            | RebalanceDroidDifficultyCalculator
    ): Promise<
        | PerformanceCalculationResult<
              DroidDifficultyCalculator,
              DroidPerformanceCalculator
          >
        | RebalancePerformanceCalculationResult<
              RebalanceDroidDifficultyCalculator,
              RebalanceDroidPerformanceCalculator
          >
    > {
        if (!replay.hasBeenCheckedFor2Hand) {
            replay.beatmap = difficultyCalculator;
            replay.checkFor2Hand();
        }

        const diffCalcHelper: BeatmapDroidDifficultyCalculator =
            new BeatmapDroidDifficultyCalculator();
        const calculationParams: PerformanceCalculationParameters =
            BeatmapDifficultyCalculator.getCalculationParameters(replay);

        if (difficultyCalculator instanceof DroidDifficultyCalculator) {
            return diffCalcHelper.calculateBeatmapPerformance(
                difficultyCalculator.attributes,
                calculationParams
            );
        } else {
            return diffCalcHelper.calculateBeatmapRebalancePerformance(
                difficultyCalculator.attributes,
                calculationParams
            );
        }
    }

    /**
     * Applies a slider cheese penalty to a calculation result.
     *
     * @param replay The replay associated with the calculation result.
     * @param calcResult The calculation result to apply the slider cheese penalty to.
     * @returns Whether the operation was successful.
     */
    static async applySliderCheesePenalty(
        replay: ReplayAnalyzer,
        calcResult:
            | PerformanceCalculationResult<
                  DroidDifficultyCalculator,
                  DroidPerformanceCalculator
              >
            | RebalancePerformanceCalculationResult<
                  RebalanceDroidDifficultyCalculator,
                  RebalanceDroidPerformanceCalculator
              >
    ): Promise<boolean> {
        if (!replay.data) {
            return false;
        }

        if (!replay.hasBeenCheckedForSliderCheesing) {
            const beatmap = await getBeatmap(replay.data.hash);
            if (!beatmap) {
                return false;
            }

            replay.beatmap ??= beatmap.beatmap;
            replay.checkForSliderCheesing();
            calcResult.params.sliderCheesePenalty = replay.sliderCheesePenalty;
        }

        calcResult.result.applyAimSliderCheesePenalty(
            replay.sliderCheesePenalty.aimPenalty
        );
        calcResult.result.applyFlashlightSliderCheesePenalty(
            replay.sliderCheesePenalty.flashlightPenalty
        );
        calcResult.result.applyVisualSliderCheesePenalty(
            replay.sliderCheesePenalty.visualPenalty
        );

        return true;
    }
}
