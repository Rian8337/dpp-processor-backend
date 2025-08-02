import { RawDifficultyAttributes } from "@/types";
import { Mod } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";

/**
 * Provides operations for interacting with difficulty attributes in the database.
 *
 * @template TAttributes The type of difficulty attributes.
 */
export interface IDifficultyAttributesRepository<
    TAttributes extends RawDifficultyAttributes,
> {
    /**
     * Retrieves the difficulty attributes of a beatmap.
     *
     * @param beatmapId The ID of the beatmap.
     * @returns The difficulty attributes of the beatmap.
     */
    getAttributes(
        beatmapId: number,
    ): Promise<CacheableDifficultyAttributes<TAttributes>[]>;

    /**
     * Retrieves the difficulty attributes of a beatmap with specific mods.
     *
     * @param beatmapId The ID of the beatmap.
     * @param mods The mods to retrieve.
     * @returns The difficulty attributes of the beatmap with the specified mods, or `null` if not found.
     */
    getAttributes(
        beatmapId: number,
        mods: Iterable<Mod>,
    ): Promise<CacheableDifficultyAttributes<TAttributes> | null>;

    /**
     * Adds difficulty attributes for a beatmap. If there is already attributes for the beatmap with the
     * same mods, the new attributes will not be added.
     *
     * @param beatmapId The ID of the beatmap.
     * @param attributes The difficulty attributes to add.
     * @returns `true` if the attributes were added successfully, `false` otherwise.
     */
    addAttributes(
        beatmapId: number,
        attributes: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<boolean>;
}
