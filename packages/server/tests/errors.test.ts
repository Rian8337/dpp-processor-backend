import { describe, expect, it } from "vitest";
import { APIError, BadRequestError, UnauthorizedError } from "../src/errors";

describe("API errors", () => {
    it.each([
        [new BadRequestError("bad"), 400, "INVALID_REQUEST"],
        [new UnauthorizedError(), 401, "UNAUTHORIZED"],
        [new APIError(503, "OVERLOADED", "busy"), 503, "OVERLOADED"],
    ])("%s has status %i and code %s", (error, status, code) => {
        expect(error.statusCode).toBe(status);
        expect(error.code).toBe(code);
        expect(error.toResponse()).toEqual({
            error: { code, message: error.message },
        });
    });

    it("names errors after their class", () => {
        expect(new BadRequestError("bad").name).toBe("BadRequestError");
    });
});
