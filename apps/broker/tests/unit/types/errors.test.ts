import { RegistryChangeError } from "@/registry/RegistryChangeError";
import {
    ConflictError,
    ForbiddenError,
    KeyRequiredError,
    NotFoundError,
    ProcessorError,
    ProcessorTimeoutError,
    RateLimitedError,
    RouteNotFoundError,
    VariantNotFoundError,
    VariantUnavailableError,
    toApiError,
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
        [new ForbiddenError("no"), 403, "FORBIDDEN"],
        [new NotFoundError("no"), 404, "NOT_FOUND"],
        [new ConflictError("no"), 409, "CONFLICT"],
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

    it.each([
        ["invalid", 400, "INVALID_REQUEST"],
        ["not-found", 404, "NOT_FOUND"],
        ["variant-not-found", 404, "VARIANT_NOT_FOUND"],
        ["conflict", 409, "CONFLICT"],
    ] as const)(
        "maps a %s registry change error to %i %s",
        (kind, status, code) => {
            const error = toApiError(
                new RegistryChangeError(kind, "Some message"),
            );

            expect(error.statusCode).toBe(status);
            expect(error.toResponse()).toEqual({
                error: { code, message: "Some message" },
            });
        },
    );
});
