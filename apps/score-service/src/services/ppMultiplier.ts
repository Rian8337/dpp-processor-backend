/**
 * How a stored pp_multiplier is applied: missing means 1, never above 1.
 */
export function effectiveMultiplier(stored: number | null | undefined): number {
    return Math.min(stored ?? 1, 1);
}

/**
 * pp ÷ no-penalty total, or 1 when the no-penalty total is 0.
 */
export function ppMultiplierFrom(pp: number, noPenaltyTotal: number): number {
    return noPenaltyTotal === 0 ? 1 : pp / noPenaltyTotal;
}
