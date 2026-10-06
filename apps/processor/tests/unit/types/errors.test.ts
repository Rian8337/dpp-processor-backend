import {
    BadRequestError,
    CalculationFailedError,
    NotFoundError,
    ServiceUnavailableError,
    UnauthorizedError,
    UnprocessableEntityError,
} from "@/types/errors";
import { describe, expect, it } from "vitest";

describe("API errors", () => {
    it.each([
        [new BadRequestError("bad"), 400, "INVALID_REQUEST"],
        [new UnauthorizedError(), 401, "UNAUTHORIZED"],
        [
            new NotFoundError("BEATMAP_NOT_FOUND", "missing"),
            404,
            "BEATMAP_NOT_FOUND",
        ],
        [
            new UnprocessableEntityError("INVALID_REPLAY", "broken"),
            422,
            "INVALID_REPLAY",
        ],
        [new ServiceUnavailableError("OVERLOADED", "busy"), 503, "OVERLOADED"],
        [new CalculationFailedError("boom"), 500, "CALCULATION_FAILED"],
    ])("%s has status %i and code %s", (error, status, code) => {
        expect(error.statusCode).toBe(status);
        expect(error.code).toBe(code);
        expect(error.toResponse()).toEqual({
            error: { code, message: error.message },
        });
    });
});
