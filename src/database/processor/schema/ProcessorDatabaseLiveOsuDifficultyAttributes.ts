import { ProcessorDatabaseDifficultyAttributes } from "./ProcessorDatabaseDifficultyAttributes";

/**
 * Represents live osu! difficulty attributes that are in the processor's database.
 */
export interface ProcessorDatabaseLiveOsuDifficultyAttributes
    extends ProcessorDatabaseDifficultyAttributes {
    /**
     * The mods which were applied to the beatmap.
     */
    readonly mods: number;

    /**
     * The difficulty corresponding to the speed skill.
     */
    readonly speed_difficulty: number;
}
