import { IOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { IDifficultyAttributesRepository } from "./IDifficultyAttributesRepository";

/**
 * Provides operations for interacting with rebalance osu! difficulty attributes in the database.
 */
export type IRebalanceOsuDifficultyAttributesRepository =
    IDifficultyAttributesRepository<IOsuDifficultyAttributes>;
