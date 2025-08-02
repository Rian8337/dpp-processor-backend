import { IOsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { IDifficultyAttributesRepository } from "./IDifficultyAttributesRepository";

/**
 * Provides operations for interacting with live osu! difficulty attributes in the database.
 */
export type ILiveOsuDifficultyAttributesRepository =
    IDifficultyAttributesRepository<IOsuDifficultyAttributes>;
