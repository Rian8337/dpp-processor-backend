import type { ErrorCode, ErrorResponse } from "@dpp/shared";

/**
 * An error that maps to an HTTP response.
 */
export class APIError extends Error {
    constructor(
        readonly statusCode: number,
        readonly code: ErrorCode,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }

    /**
     * Builds the response body for this error.
     */
    toResponse(): ErrorResponse {
        return { error: { code: this.code, message: this.message } };
    }
}

export class BadRequestError extends APIError {
    constructor(message: string) {
        super(400, "INVALID_REQUEST", message);
    }
}

export class UnauthorizedError extends APIError {
    constructor() {
        super(401, "UNAUTHORIZED", "Missing or invalid API key");
    }
}
