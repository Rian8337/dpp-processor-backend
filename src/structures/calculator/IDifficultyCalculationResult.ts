import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DifficultyAttributes as RebalanceDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { CacheableDifficultyAttributes } from "../attributes/CacheableDifficultyAttributes";

/**
 * A structure for implementing difficulty calculation results.
 */
export interface IDifficultyCalculationResult<
    DA extends DifficultyAttributes | RebalanceDifficultyAttributes
> {
    /**
     * The difficulty attributes of the calculated beatmap.
     */
    readonly attributes: DA;

    /**
     * The attributes that were cached into the cache manager as a result of this calculation.
     */
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;
}
