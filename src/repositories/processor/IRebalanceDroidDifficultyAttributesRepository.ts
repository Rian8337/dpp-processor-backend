import { IExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { IDifficultyAttributesRepository } from "./IDifficultyAttributesRepository";

/**
 * Provides operations for interacting with rebalance osu!droid difficulty attributes in the database.
 */
export type IRebalanceDroidDifficultyAttributesRepository =
    IDifficultyAttributesRepository<IExtendedDroidDifficultyAttributes>;
