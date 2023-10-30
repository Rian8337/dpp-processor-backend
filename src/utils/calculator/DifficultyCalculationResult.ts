import {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";
import { ModUtil } from "@rian8337/osu-base";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class DifficultyCalculationResult<DA extends DifficultyAttributes>
    implements IDifficultyCalculationResult<DA>
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
