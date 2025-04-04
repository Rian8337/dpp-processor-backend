import { Modes } from "@rian8337/osu-base";
import { IOsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { IOsuDifficultyAttributes as IRebalanceOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import {
    liveOsuDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../cache/difficultyAttributesStorage";
import { BeatmapDifficultyCalculator } from "./BeatmapDifficultyCalculator";

/**
 * A helper class for calculating osu!standard difficulty and performance of beatmaps or scores.
 */
export class BeatmapOsuDifficultyCalculator extends BeatmapDifficultyCalculator<
    IOsuDifficultyAttributes,
    IRebalanceOsuDifficultyAttributes,
    OsuPerformanceAttributes
> {
    protected override readonly mode = Modes.osu;
    protected override readonly liveDifficultyAttributesCache =
        liveOsuDifficultyCache;
    protected override readonly rebalanceDifficultyAttributesCache =
        rebalanceOsuDifficultyCache;
}
