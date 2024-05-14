import { DatabaseDifficultyAttributes } from "./DatabaseDifficultyAttributes";

/**
 * Represents live osu! difficulty attributes that are in the database.
 */
export interface DatabaseLiveOsuDifficultyAttributes
    extends DatabaseDifficultyAttributes {
    /**
     * The mods which were applied to the beatmap.
     */
    readonly mods: number;

    /**
     * The difficulty corresponding to the speed skill.
     */
    readonly speed_difficulty: number;
}
