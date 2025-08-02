import { DroidPerformanceAttributes } from "@/types";
import { IExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { ICalculationService } from "./ICalculationService";

/**
 * Provides calculation operations for rebalance osu!droid difficulty and performance.
 */
export type IRebalanceDroidCalculationService = ICalculationService<
    IExtendedDroidDifficultyAttributes,
    DroidPerformanceAttributes
>;
