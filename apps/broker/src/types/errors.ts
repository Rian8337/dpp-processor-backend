import type { RegistryChangeError } from "@/registry/RegistryChangeError";
import { APIError, BadRequestError } from "@dpp/server";

export class VariantNotFoundError extends APIError {
    constructor(name: string) {
        super(404, "VARIANT_NOT_FOUND", `Variant "${name}" not found`);
    }
}

export class RouteNotFoundError extends APIError {
    constructor() {
        super(404, "INVALID_REQUEST", "Route not found");
    }
}

/**
 * Anonymous access is turned off (`ANON_RATE_LIMIT=0`) and the request has no key.
 */
export class KeyRequiredError extends APIError {
    constructor() {
        super(401, "UNAUTHORIZED", "An API key is required");
    }
}

/**
 * The `X-Acting-Uid` header is not allowed for the caller or is not a valid uid.
 */
export class InvalidActingUidError extends APIError {
    constructor(reason: "not-allowed" | "malformed") {
        super(
            400,
            "INVALID_REQUEST",
            reason === "not-allowed"
                ? "This key cannot act for users"
                : "X-Acting-Uid must be a positive integer",
        );
    }
}

export class RateLimitedError extends APIError {
    constructor() {
        super(
            429,
            "RATE_LIMITED",
            "Too many requests; the RateLimit headers say when to retry",
        );
    }
}

export class ProcessorError extends APIError {
    constructor(message: string) {
        super(502, "PROCESSOR_ERROR", message);
    }
}

export class VariantUnavailableError extends APIError {
    constructor(name: string) {
        super(
            503,
            "VARIANT_UNAVAILABLE",
            `Variant "${name}" has no healthy processor`,
        );
    }
}

export class ProcessorTimeoutError extends APIError {
    constructor(name: string) {
        super(
            504,
            "PROCESSOR_TIMEOUT",
            `The processor for variant "${name}" did not respond in time`,
        );
    }
}

/**
 * The caller may not make the request: no acting person, or a role that is too low.
 */
export class ForbiddenError extends APIError {
    constructor(message: string) {
        super(403, "FORBIDDEN", message);
    }
}

/**
 * An alias, key, or grant named by the request does not exist.
 */
export class NotFoundError extends APIError {
    constructor(message: string) {
        super(404, "NOT_FOUND", message);
    }
}

/**
 * The request clashes with the registry's current state.
 */
export class ConflictError extends APIError {
    constructor(message: string) {
        super(409, "CONFLICT", message);
    }
}

/**
 * The API error for a change the registry refused.
 */
export function toApiError(error: RegistryChangeError): APIError {
    switch (error.kind) {
        case "invalid":
            return new BadRequestError(error.message);
        case "not-found":
            return new NotFoundError(error.message);
        case "variant-not-found":
            return new APIError(404, "VARIANT_NOT_FOUND", error.message);
        case "conflict":
            return new ConflictError(error.message);
    }
}
