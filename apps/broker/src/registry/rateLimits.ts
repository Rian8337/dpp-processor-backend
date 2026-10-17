const maxRateLimit = 2147483647;

/**
 * Whether a number can be a key's requests-per-minute limit: a positive integer that fits a 32-bit signed column.
 */
export function isValidRateLimit(limit: number): boolean {
    return Number.isSafeInteger(limit) && limit >= 1 && limit <= maxRateLimit;
}

/**
 * The message for a limit that {@link isValidRateLimit} refuses.
 */
export function invalidRateLimitMessage(limit: string | number): string {
    return `Invalid limit "${limit.toString()}": expected a whole number of requests per minute`;
}
