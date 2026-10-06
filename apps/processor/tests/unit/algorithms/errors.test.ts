import { AlgorithmInputError } from "@/algorithms/errors";
import { BadRequestError, UnprocessableEntityError } from "@/types/errors";
import { describe, expect, it } from "vitest";

describe("AlgorithmInputError.toApiError", () => {
    it.each([
        ["INVALID_BEATMAP", UnprocessableEntityError, 422],
        ["INVALID_REPLAY", UnprocessableEntityError, 422],
        ["INVALID_REQUEST", BadRequestError, 400],
    ] as const)("maps %s to the matching API error", (code, type, status) => {
        const apiError = new AlgorithmInputError(code, "message").toApiError();

        expect(apiError).toBeInstanceOf(type);
        expect(apiError.statusCode).toBe(status);
        expect(apiError.toResponse()).toEqual({
            error: { code, message: "message" },
        });
    });
});
