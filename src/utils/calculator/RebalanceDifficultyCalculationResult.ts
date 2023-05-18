import { MapInfo } from "@rian8337/osu-base";
import {
    DifficultyAttributes as RebalanceDifficultyAttributes,
    DifficultyCalculator as RebalanceDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";
import { CacheableDifficultyAttributes } from "../../structures/difficultyattributes/CacheableDifficultyAttributes";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class RebalanceDifficultyCalculationResult<
    DA extends RebalanceDifficultyAttributes,
    D extends RebalanceDifficultyCalculator
> implements IDifficultyCalculationResult<DA, D>
{
    readonly map: MapInfo<true>;
    readonly result: D;
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;

    constructor(
        map: MapInfo<true>,
        result: D,
        cachedAttributes: CacheableDifficultyAttributes<DA>
    ) {
        this.map = map;
        this.result = result;
        this.cachedAttributes = cachedAttributes;
    }
}
