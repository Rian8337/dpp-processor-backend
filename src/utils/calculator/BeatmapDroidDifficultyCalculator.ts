import { BeatmapDifficultyCalculator } from "./BeatmapDifficultyCalculator";
import { Beatmap, Modes } from "@rian8337/osu-base";
import { ExtendedDroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    ReplayAnalyzer,
    ThreeFingerChecker,
} from "@rian8337/osu-droid-replay-analyzer";
import {
    liveDroidDifficultyCache,
    rebalanceDroidDifficultyCache,
} from "../cache/difficultyAtributesStorage";
import { DroidPerformanceAttributes } from "../../structures/attributes/DroidPerformanceAttributes";
import { RebalanceDroidPerformanceAttributes } from "../../structures/attributes/RebalanceDroidPerformanceAttributes";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { ProcessorDatabaseLiveDroidDifficultyAttributes } from "../../database/processor/schema/ProcessorDatabaseLiveDroidDifficultyAttributes";
import { ProcessorDatabaseRebalanceDroidDifficultyAttributes } from "../../database/processor/schema/ProcessorDatabaseRebalanceDroidDifficultyAttributes";

/**
 * A helper class for calculating osu!droid difficulty and performance of beatmaps or scores.
 */
export class BeatmapDroidDifficultyCalculator extends BeatmapDifficultyCalculator<
    ExtendedDroidDifficultyAttributes,
    ProcessorDatabaseLiveDroidDifficultyAttributes,
    RebalanceExtendedDroidDifficultyAttributes,
    ProcessorDatabaseRebalanceDroidDifficultyAttributes,
    DroidPerformanceAttributes,
    RebalanceDroidPerformanceAttributes
> {
    protected override readonly mode = Modes.droid;
    protected override readonly liveDifficultyAttributesCache =
        liveDroidDifficultyCache;
    protected override readonly rebalanceDifficultyAttributesCache =
        rebalanceDroidDifficultyCache;

    /**
     * Applies a tap penalty to a calculation parameter.
     *
     * @param calculationParams The calculation parameter.
     * @param beatmap The beatmap associated with the calculation parameter.
     * @param replay The replay associated with the calculation parameter.
     * @param difficultyAttributes The difficulty attributes of the beatmap.
     * @returns Whether the operation was successful.
     */
    static applyTapPenalty(
        calculationParams: PerformanceCalculationParameters,
        beatmap: Beatmap,
        replay: ReplayAnalyzer,
        difficultyAttributes:
            | ExtendedDroidDifficultyAttributes
            | RebalanceExtendedDroidDifficultyAttributes
    ): boolean {
        if (!replay.data) {
            return false;
        }

        if (!ThreeFingerChecker.isEligibleToDetect(difficultyAttributes)) {
            // No need to check for three-finger
            return true;
        }

        if (!replay.hasBeenCheckedFor3Finger) {
            replay.beatmap ??= beatmap;
            replay.difficultyAttributes = difficultyAttributes;
            replay.checkFor3Finger();
            calculationParams.tapPenalty = replay.tapPenalty;
        }

        return true;
    }

    /**
     * Applies a slider cheese penalty to a calculation parameter.
     *
     * @param calculationParams The calculation parameter.
     * @param beatmap The beatmap associated with the calculation parameter.
     * @param replay The replay associated with the calculation parameter.
     * @param difficultyAttributes The difficulty attributes of the beatmap.
     * @returns Whether the operation was successful.
     */
    static applySliderCheesePenalty(
        calculationParams: PerformanceCalculationParameters,
        beatmap: Beatmap,
        replay: ReplayAnalyzer,
        difficultyAttributes:
            | ExtendedDroidDifficultyAttributes
            | RebalanceExtendedDroidDifficultyAttributes
    ): boolean {
        if (difficultyAttributes.difficultSliders.length === 0) {
            return true;
        }

        if (!replay.data) {
            return false;
        }

        if (!replay.hasBeenCheckedForSliderCheesing) {
            replay.beatmap ??= beatmap;
            replay.difficultyAttributes = difficultyAttributes;
            replay.checkForSliderCheesing();
            calculationParams.sliderCheesePenalty = replay.sliderCheesePenalty;
        }

        return true;
    }
}
