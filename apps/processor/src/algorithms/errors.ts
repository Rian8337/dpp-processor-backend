import { UnprocessableEntityError } from "@/types/errors";
import { BadRequestError, type APIError } from "@dpp/server/errors";

/**
 * Codes for invalid input detected by an algorithm.
 */
export type AlgorithmErrorCode =
    | "INVALID_BEATMAP"
    | "INVALID_REPLAY"
    | "INVALID_REQUEST";

/**
 * An error caused by invalid input rather than a calculator failure.
 *
 * Algorithms also run inside worker threads, where error classes do not survive the trip back to the main thread.
 * There the error travels as a task outcome, and the main thread rebuilds it to call {@link toApiError}.
 */
export class AlgorithmInputError extends Error {
    constructor(
        readonly code: AlgorithmErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "AlgorithmInputError";
    }

    /**
     * Converts this error to the API error returned to the client.
     */
    toApiError(): APIError {
        return this.code === "INVALID_REQUEST"
            ? new BadRequestError(this.message)
            : new UnprocessableEntityError(this.code, this.message);
    }
}
