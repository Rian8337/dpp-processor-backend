import { ProcessorDatabaseDifficultyAttributes } from "./ProcessorDatabaseDifficultyAttributes";

/**
 * Represents live osu! difficulty attributes that are in the processor's database.
 */
export interface ProcessorDatabaseLiveOsuDifficultyAttributes
    extends ProcessorDatabaseDifficultyAttributes {
    /**
     * The difficulty corresponding to the speed skill.
     */
    readonly speed_difficulty: number;

    /**
     * The perceived approach rate inclusive of rate-adjusting mods (DT/HT/etc).
     *
     * Rate-adjusting mods don't directly affect the approach rate difficulty value, but have a perceived effect as a result of adjusting audio timing.
     */
    readonly approach_rate: number;

    /**
     * The amount of strains that are considered difficult with respect to the speed skill.
     */
    readonly speed_difficult_strain_count: number;
}
