/**
 * Machine-readable error codes returned by the processor.
 */
export const errorCodes = [
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "BEATMAP_NOT_FOUND",
    "INVALID_BEATMAP",
    "INVALID_REPLAY",
    "BEATMAP_SERVICE_UNAVAILABLE",
    "OVERLOADED",
    "CALCULATION_FAILED",
    "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/**
 * The body of every error response.
 */
export interface ErrorResponse {
    readonly error: {
        readonly code: ErrorCode;
        readonly message: string;
    };
}
