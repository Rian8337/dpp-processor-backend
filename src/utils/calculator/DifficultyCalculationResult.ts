import {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class DifficultyCalculationResult<DA extends IDifficultyAttributes>
    implements IDifficultyCalculationResult<DA>
{
    readonly attributes: DA;
    readonly cachedAttributes: CacheableDifficultyAttributes<DA>;

    constructor(attributes: DA) {
        this.attributes = attributes;

        this.cachedAttributes = {
            ...attributes,
            mods: attributes.mods.serializeMods(),
        };
    }
}
