import { MapInfo } from "@rian8337/osu-base";
import {
    DifficultyCalculator,
    DifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DifficultyCalculator as RebalanceDifficultyCalculator,
    DifficultyAttributes as RebalanceDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { CacheableDifficultyAttributes } from "../attributes/CacheableDifficultyAttributes";

/**
 * A structure for implementing difficulty calculation results.
 */
export interface IDifficultyCalculationResult<
    DA extends DifficultyAttributes | RebalanceDifficultyAttributes,
    D extends DifficultyCalculator | RebalanceDifficultyCalculator
> {
    /**
     * The beatmap being calculated.
     */
    readonly map: MapInfo<true>;

    /**
     * The difficulty calculator that calculated the beatmap.
     */
    readonly result: D;

    /**
     * The attributes that were cached into the cache manager as a result of this calculation.
     */
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;
}
