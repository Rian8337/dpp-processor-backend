import {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { IDifficultyAttributes as IRebalanceDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";

/**
 * A structure for implementing difficulty calculation results.
 */
export interface IDifficultyCalculationResult<
    DA extends IDifficultyAttributes | IRebalanceDifficultyAttributes,
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
