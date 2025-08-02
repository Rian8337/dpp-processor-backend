import { OsuPerformanceAttributes } from "@/types";
import { IOsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ICalculationService } from "./ICalculationService";

/**
 * Provides calculation operations for live osu! difficulty and performance.
 */
export type ILiveOsuCalculationService = ICalculationService<
    IOsuDifficultyAttributes,
    OsuPerformanceAttributes
>;
