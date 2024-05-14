import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { RawDifficultyAttributes } from "./RawDifficultyAttributes";
import { Collection } from "@discordjs/collection";

/**
 * Difficulty attributes of a beatmap that were cached.
 */
export interface CachedDifficultyAttributes<T extends RawDifficultyAttributes> {
    /**
     * The time at which the beatmap was last updated.
     */
    lastUpdate: Date;

    /**
     * The difficulty attributes of the beatmap, following the formatting rule:
     *
     * `"<mods (in droid mod string for droid, in bitwise for standard)>[|<speed multiplier>x[|AR<force AR>]]": {}`
     */
    difficultyAttributes: Collection<string, CacheableDifficultyAttributes<T>>;
}
