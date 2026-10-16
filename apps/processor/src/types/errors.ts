import { APIError } from "@dpp/server/errors";

export class NotFoundError extends APIError {
    constructor(code: "BEATMAP_NOT_FOUND", message: string) {
        super(404, code, message);
    }
}

export class UnprocessableEntityError extends APIError {
    constructor(code: "INVALID_BEATMAP" | "INVALID_REPLAY", message: string) {
        super(422, code, message);
    }
}

export class ServiceUnavailableError extends APIError {
    constructor(
        code: "BEATMAP_SERVICE_UNAVAILABLE" | "OVERLOADED",
        message: string,
    ) {
        super(503, code, message);
    }
}

export class CalculationFailedError extends APIError {
    constructor(message: string) {
        super(500, "CALCULATION_FAILED", message);
    }
}
