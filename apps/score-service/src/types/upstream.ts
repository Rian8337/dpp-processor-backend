import type { ErrorCode } from "@dpp/shared";
import { RetryLaterError } from "./errors";

/**
 * Why a call to the broker, the beatmap service, or the Discord backend failed.
 *
 * - `rejected`: a definite answer (4xx, 500, or a malformed body). Retrying gets the same answer.
 * - `retry`: the upstream is busy or unreachable (`502`, `503`, `504`, `429`, connection failure, timeout).
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

const retryStatuses = new Set([429, 502, 503, 504]);

/**
 * Classifies a non-2xx response.
 */
export function failureFromResponse(
    response: Response,
    code: ErrorCode,
    message: string,
): UpstreamFailure {
    const retry = retryStatuses.has(response.status);
    const retryAfter = Number(response.headers.get("retry-after"));

    return {
        ok: false,
        kind: retry ? "retry" : "rejected",
        status: response.status,
        code,
        message,
        ...(retry &&
            Number.isFinite(retryAfter) &&
            retryAfter >= 0 &&
            response.headers.has("retry-after") && {
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
 * The failure for a 2xx response whose body is not what was expected.
 */
export function malformed(code: ErrorCode, message: string): UpstreamFailure {
    return { ok: false, kind: "rejected", status: 502, code, message };
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
 * For background work: the value, `null` for a permanent failure, or a thrown {@link RetryLaterError}.
 *
 * Retry failures and configuration rejections (`UNAUTHORIZED`, `VARIANT_NOT_FOUND`) throw; every other rejection
 * (such as `BEATMAP_NOT_FOUND` or `INVALID_REPLAY`) is permanent and gives `null`.
 */
export function requireValue<T>(result: UpstreamResult<T>): T | null {
    if (result.ok) {
        return result.value;
    }

    if (result.kind === "retry") {
        throw new RetryLaterError(result.message, result.retryAfterMs);
    }

    if (configurationCodes.has(result.code)) {
        throw new RetryLaterError(
            `Configuration problem (${result.code}): ${result.message}`,
            result.retryAfterMs,
        );
    }

    return null;
}
