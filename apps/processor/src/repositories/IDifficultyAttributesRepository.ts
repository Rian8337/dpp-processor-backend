import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";

/**
 * Identifies a stored set of difficulty attributes.
 */
export interface DifficultyAttributesKey {
    readonly calculatorVersion: string;
    readonly beatmapHash: string;

    /**
     * The canonical mods key from `createModsKey`.
     */
    readonly mods: string;
}

/**
 * Stores difficulty attributes in the variant's database.
 */
export interface IDifficultyAttributesRepository {
    /**
     * Finds stored attributes, or `null` if there are none.
     */
    find(
        key: DifficultyAttributesKey,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes> | null>;

    /**
     * Stores attributes. Does nothing if attributes with the same key already exist.
     */
    insert(
        key: DifficultyAttributesKey,
        attributes: CacheableDifficultyAttributes<IDifficultyAttributes>,
    ): Promise<void>;

    /**
     * Deletes attributes of every calculator version except the given one.
     *
     * @returns The number of deleted rows.
     */
    deleteOtherVersions(calculatorVersion: string): Promise<number>;
}
