import { IExtendedDroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { IDifficultyAttributesRepository } from "./IDifficultyAttributesRepository";

/**
 * Provides operations for interacting with live osu!droid difficulty attributes in the database.
 */
export type ILiveDroidDifficultyAttributesRepository =
    IDifficultyAttributesRepository<IExtendedDroidDifficultyAttributes>;
