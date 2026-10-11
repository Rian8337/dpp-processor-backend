import type { ErrorCode } from "@dpp/shared";
import { RetryLaterError } from "./errors";

/**
 * Why a call to the broker or the beatmap service failed.
 *
 * Classification rule, applied everywhere: **permanent (`rejected`) means a definite answer about this item;
 * everything else is `retry`.** Background work that gets a `retry` leaves its data untouched and tries again later;
 * only a `rejected` answer may invalidate or skip an item.
 *
 * - Broker: a 4xx (except `429`) or a `CALCULATION_FAILED` answer is definite. Any other 5xx, `429`, a connection
 *   failure, a timeout, or a malformed 2xx body (a configuration error, such as a wrong-mode processor) is `retry`.
 * - Beatmap service: only a `404` with its JSON `{ "error": string }` body ("beatmap not found") is definite.
 *   Everything else (`401` for a wrong key, other 4xx, 5xx, non-JSON bodies, malformed 2xx bodies) is `retry`.
 */
export interface UpstreamFailure {
    readonly ok: false;
    readonly kind: "rejected" | "retry";
    readonly status: number;
    readonly code: ErrorCode;
    readonly message: string;

    /**
     * From the response's `Retry-After`, when it has one.
     */
    readonly retryAfterMs?: number;
}

export type UpstreamResult<T> =
    | { readonly ok: true; readonly value: T }
    | UpstreamFailure;

/**
 * Classifies a non-2xx response. With `retryAll`, every status is `retry` (the caller has already decided that this
 * response is not a definite answer).
 */
export function failureFromResponse(
    response: Response,
    code: ErrorCode,
    message: string,
    retryAll = false,
): UpstreamFailure {
    const retry =
        retryAll ||
        response.status === 429 ||
        (response.status >= 500 && code !== "CALCULATION_FAILED");
    const header = response.headers.get("retry-after")?.trim();
    const retryAfter = header ? Number(header) : Number.NaN;

    return {
        ok: false,
        kind: retry ? "retry" : "rejected",
        status: response.status,
        code,
        message,
        ...(retry &&
            Number.isFinite(retryAfter) &&
            retryAfter >= 0 && {
                retryAfterMs: retryAfter * 1000,
            }),
    };
}

/**
 * The failure for an upstream that could not be reached or did not answer in time.
 */
export function unreachable(code: ErrorCode, message: string): UpstreamFailure {
    return { ok: false, kind: "retry", status: 503, code, message };
}

/**
 * The failure for a 2xx response whose body is not what was expected. It is a configuration or upstream bug, not a
 * statement about the item, so it is retried.
 */
export function malformed(code: ErrorCode, message: string): UpstreamFailure {
    return { ok: false, kind: "retry", status: 502, code, message };
}

/**
 * Rejections caused by this service's own configuration (bad key, wrong variant name): retrying later, after the
 * operator fixes it, loses nothing, while treating them as permanent would drop data.
 */
const configurationCodes = new Set<string>([
    "UNAUTHORIZED",
    "VARIANT_NOT_FOUND",
]);

/**
 * Whether a failure says nothing about the item itself: the upstream is unavailable, or this service is
 * misconfigured (`UNAUTHORIZED`, `VARIANT_NOT_FOUND`). Waiting and trying again loses nothing.
 */
export function isRetryLater(failure: UpstreamFailure): boolean {
    return failure.kind === "retry" || configurationCodes.has(failure.code);
}

/**
 * For background work: the value, `null` for a permanent failure, or a thrown {@link RetryLaterError}.
 *
 * Retry failures and configuration rejections (`UNAUTHORIZED`, `VARIANT_NOT_FOUND`) throw; every other rejection
 * (such as `BEATMAP_NOT_FOUND` or `INVALID_REPLAY`) is permanent and gives `null`.
 */
export function requireValue<T>(result: UpstreamResult<T>): T | null {
    if (result.ok) {
        return result.value;
    }

    if (!isRetryLater(result)) {
        return null;
    }

    throw new RetryLaterError(
        result.kind === "retry"
            ? result.message
            : `Configuration problem (${result.code}): ${result.message}`,
        result.retryAfterMs,
    );
}
