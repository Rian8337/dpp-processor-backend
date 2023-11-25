import { CloneableMapStats } from "./CloneableMapStats";

/**
 * Represents a parameter to alter difficulty calculation result that can be cloned
 * for specific purposes (i.e., passing data between worker threads).
 */
export interface CloneableDifficultyCalculationParameters<
    TFromCalculation extends boolean = boolean
> {
    /**
     * Statistics to apply forced map statistics, mods, custom speed multiplier,
     * as well as NightCore mod penalty for replay version 3 or older.
     */
    customStatistics: CloneableMapStats<TFromCalculation>;
}
