import {
    KeyRequiredError,
    ProcessorError,
    ProcessorTimeoutError,
    RateLimitedError,
    RouteNotFoundError,
    VariantNotFoundError,
    VariantUnavailableError,
} from "@/types/errors";
import { describe, expect, it } from "vitest";

describe("broker API errors", () => {
    it.each([
        [new KeyRequiredError(), 401, "UNAUTHORIZED"],
        [new VariantNotFoundError("x"), 404, "VARIANT_NOT_FOUND"],
        [new RouteNotFoundError(), 404, "INVALID_REQUEST"],
        [new RateLimitedError(), 429, "RATE_LIMITED"],
        [new ProcessorError("bad"), 502, "PROCESSOR_ERROR"],
        [new VariantUnavailableError("x"), 503, "VARIANT_UNAVAILABLE"],
        [new ProcessorTimeoutError("x"), 504, "PROCESSOR_TIMEOUT"],
    ])("%s has status %i and code %s", (error, status, code) => {
        expect(error.statusCode).toBe(status);
        expect(error.toResponse()).toEqual({
            error: { code, message: error.message },
        });
    });

    it("names the variant in its messages", () => {
        expect(new VariantNotFoundError("droid-live").message).toBe(
            'Variant "droid-live" not found',
        );
        expect(new RouteNotFoundError().message).toBe("Route not found");
    });
});
