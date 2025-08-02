import { DroidPerformanceAttributes } from "@/types";
import { IExtendedDroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ICalculationService } from "./ICalculationService";

/**
 * Provides calculation operations for live osu!droid difficulty and performance.
 */
export type ILiveDroidCalculationService = ICalculationService<
    IExtendedDroidDifficultyAttributes,
    DroidPerformanceAttributes
>;
