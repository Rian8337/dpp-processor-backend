/**
 * Machine-readable error codes returned by processors. The broker passes them through.
 */
export const processorErrorCodes = [
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

/**
 * Machine-readable error codes that only the broker returns.
 */
export const brokerErrorCodes = [
    "VARIANT_NOT_FOUND",
    "RATE_LIMITED",
    "VARIANT_UNAVAILABLE",
    "PROCESSOR_ERROR",
    "PROCESSOR_TIMEOUT",
] as const;

/**
 * Every error code a client can receive.
 */
export const errorCodes = [
    ...processorErrorCodes,
    ...brokerErrorCodes,
] as const;

export type ProcessorErrorCode = (typeof processorErrorCodes)[number];
export type BrokerErrorCode = (typeof brokerErrorCodes)[number];
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
