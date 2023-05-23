import { RawDifficultyAttributes } from "./RawDifficultyAttributes";

/**
 * Represents difficulty attributes that can be cached.
 */
export type CacheableDifficultyAttributes<T extends RawDifficultyAttributes> =
    | T
    | { mods: undefined };
