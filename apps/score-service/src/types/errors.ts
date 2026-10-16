import { APIError } from "@dpp/server/errors";
import type { UpstreamFailure } from "./upstream";

/**
 * Background work hit a temporary failure; the item must be kept and tried again.
 */
export class RetryLaterError extends Error {
    constructor(
        message: string,
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "RetryLaterError";
    }
}

export class ScoreNotFoundError extends APIError {
    constructor() {
        super(404, "SCORE_NOT_FOUND", "Score not found");
    }
}

/**
 * A broker or beatmap service failure passed through to the caller with its status and code.
 */
export class UpstreamError extends APIError {
    static from(failure: UpstreamFailure): UpstreamError {
        return new UpstreamError(failure.status, failure.code, failure.message);
    }
}
