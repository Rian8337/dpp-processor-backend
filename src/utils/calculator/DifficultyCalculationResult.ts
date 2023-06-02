import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";
import { CacheableDifficultyAttributes } from "../../structures/attributes/CacheableDifficultyAttributes";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class DifficultyCalculationResult<DA extends DifficultyAttributes>
    implements IDifficultyCalculationResult<DA>
{
    readonly attributes: DA;
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;

    constructor(
        attributes: DA,
        cachedAttributes: CacheableDifficultyAttributes<DA>
    ) {
        this.attributes = attributes;
        this.cachedAttributes = cachedAttributes;
    }
}
