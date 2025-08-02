import { CalculationParameters } from "@/calculations";
import { DroidPerformanceAttributes } from "@/types";
import { Beatmap, Modes } from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    IExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { IExtendedDroidDifficultyAttributes as IRebalanceExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { CalculationService } from "./CalculationService";

/**
 * Provides calculation operations for osu!droid difficulty and performance.
 */
export abstract class DroidCalculationService<
    TDifficultyAttributes extends
        | IExtendedDroidDifficultyAttributes
        | IRebalanceExtendedDroidDifficultyAttributes,
    TPerformanceAttributes extends DroidPerformanceAttributes,
> extends CalculationService<TDifficultyAttributes, TPerformanceAttributes> {
    protected override readonly mode = Modes.droid;

    protected override processReplay(
        beatmap: Beatmap,
        replay: ReplayAnalyzer,
        parameters: CalculationParameters,
        attributes: CacheableDifficultyAttributes<TDifficultyAttributes>,
    ) {
        super.processReplay(beatmap, replay, parameters, attributes);

        const { data } = replay;

        if (!data) {
            return;
        }

        replay.beatmap ??= beatmap;

        replay.difficultyAttributes ??= {
            ...attributes,
            mods: parameters.mods,
        } as TDifficultyAttributes;

        if (!replay.hasBeenCheckedFor3Finger) {
            replay.checkFor3Finger();
            parameters.tapPenalty = replay.tapPenalty;
        }

        if (
            attributes.difficultSliders.length > 0 &&
            !replay.hasBeenCheckedForSliderCheesing
        ) {
            replay.checkForSliderCheesing();
            parameters.sliderCheesePenalty = replay.sliderCheesePenalty;
        }
    }
}
