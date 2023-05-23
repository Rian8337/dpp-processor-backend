import { MapInfo } from "@rian8337/osu-base";
import {
    DifficultyAttributes,
    DifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import { IDifficultyCalculationResult } from "../../structures/calculator/IDifficultyCalculationResult";
import { CacheableDifficultyAttributes } from "../../structures/attributes/CacheableDifficultyAttributes";

/**
 * Represents a beatmap's difficulty calculation result.
 */
export class DifficultyCalculationResult<
    DA extends DifficultyAttributes,
    D extends DifficultyCalculator
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
