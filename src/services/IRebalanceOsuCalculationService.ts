import { OsuPerformanceAttributes } from "@/types";
import { IOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { ICalculationService } from "./ICalculationService";

/**
 * Provides calculation operations for rebalance osu! difficulty and performance.
 */
export type IRebalanceOsuCalculationService = ICalculationService<
    IOsuDifficultyAttributes,
    OsuPerformanceAttributes
>;
