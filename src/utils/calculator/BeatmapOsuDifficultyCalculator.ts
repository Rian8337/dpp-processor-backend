import { BeatmapDifficultyCalculator } from "./BeatmapDifficultyCalculator";
import {
    OsuDifficultyAttributes,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
} from "@rian8337/osu-difficulty-calculator";
import {
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuDifficultyCalculator as RebalanceOsuDifficultyCalculator,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    liveOsuDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../cache/difficultyAtributesStorage";

/**
 * A helper class for calculating osu!standard difficulty and performance of beatmaps or scores.
 */
export class BeatmapOsuDifficultyCalculator extends BeatmapDifficultyCalculator<
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    RebalanceOsuDifficultyCalculator,
    RebalanceOsuPerformanceCalculator,
    OsuDifficultyAttributes,
    RebalanceOsuDifficultyAttributes
> {
    protected override readonly difficultyCalculator = OsuDifficultyCalculator;
    protected override readonly rebalanceDifficultyCalculator =
        RebalanceOsuDifficultyCalculator;
    protected override readonly performanceCalculator =
        OsuPerformanceCalculator;
    protected override readonly rebalancePerformanceCalculator =
        RebalanceOsuPerformanceCalculator;
    protected override readonly liveDifficultyAttributesCache =
        liveOsuDifficultyCache;
    protected override readonly rebalanceDifficultyAttributesCache =
        rebalanceOsuDifficultyCache;
}
