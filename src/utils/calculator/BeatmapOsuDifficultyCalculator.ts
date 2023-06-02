import { BeatmapDifficultyCalculator } from "./BeatmapDifficultyCalculator";
import { OsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    liveOsuDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../cache/difficultyAtributesStorage";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import { Modes } from "@rian8337/osu-base";

/**
 * A helper class for calculating osu!standard difficulty and performance of beatmaps or scores.
 */
export class BeatmapOsuDifficultyCalculator extends BeatmapDifficultyCalculator<
    OsuDifficultyAttributes,
    RebalanceOsuDifficultyAttributes,
    OsuPerformanceAttributes
> {
    protected override readonly mode = Modes.osu;
    protected override readonly liveDifficultyAttributesCache =
        liveOsuDifficultyCache;
    protected override readonly rebalanceDifficultyAttributesCache =
        rebalanceOsuDifficultyCache;
}
