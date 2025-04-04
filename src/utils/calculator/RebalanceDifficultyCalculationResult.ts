import { ModUtil } from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    IDifficultyAttributes as IRebalanceDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class RebalanceDifficultyCalculationResult<
    DA extends IRebalanceDifficultyAttributes,
> implements IDifficultyCalculationResult<DA>
{
    readonly attributes: DA;
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;

    constructor(attributes: DA) {
        this.attributes = attributes;
        this.cachedAttributes = {
            ...attributes,
            mods: ModUtil.modsToOsuString(attributes.mods),
        };
    }
}
