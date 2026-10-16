import { RetryLaterError, UpstreamError } from "@/types/errors";
import {
    failureFromResponse,
    malformed,
    requireValue,
    unreachable,
} from "@/types/upstream";
import { describe, expect, it } from "vitest";

function response(status: number, headers: Record<string, string> = {}) {
    return new Response(null, { status, headers });
}

describe("failureFromResponse", () => {
    it.each([502, 503, 504, 429])("treats %i as retry later", (status) => {
        expect(
            failureFromResponse(response(status), "INTERNAL_ERROR", "m").kind,
        ).toBe("retry");
    });

    it.each([400, 401, 403, 404, 422])("treats %i as rejected", (status) => {
        expect(
            failureFromResponse(response(status), "INTERNAL_ERROR", "m").kind,
        ).toBe("rejected");
    });

    it.each([500, 501, 502])("treats %i as retry later", (status) => {
        expect(
            failureFromResponse(response(status), "INTERNAL_ERROR", "m").kind,
        ).toBe("retry");
    });

    it("keeps a 5xx CALCULATION_FAILED rejected", () => {
        expect(
            failureFromResponse(response(500), "CALCULATION_FAILED", "m").kind,
        ).toBe("rejected");
    });

    it("retries every status when asked to", () => {
        expect(
            failureFromResponse(response(404), "INTERNAL_ERROR", "m", true)
                .kind,
        ).toBe("retry");
    });

    it("treats a blank Retry-After as absent", () => {
        expect(
            failureFromResponse(
                response(503, { "Retry-After": " " }),
                "INTERNAL_ERROR",
                "m",
            ),
        ).not.toHaveProperty("retryAfterMs");
    });

    it("reads Retry-After in seconds", () => {
        expect(
            failureFromResponse(
                response(503, { "Retry-After": "7" }),
                "INTERNAL_ERROR",
                "m",
            ),
        ).toEqual({
            ok: false,
            kind: "retry",
            status: 503,
            code: "INTERNAL_ERROR",
            message: "m",
            retryAfterMs: 7000,
        });
    });

    it("ignores an unreadable Retry-After", () => {
        expect(
            failureFromResponse(
                response(503, { "Retry-After": "soon" }),
                "INTERNAL_ERROR",
                "m",
            ),
        ).not.toHaveProperty("retryAfterMs");
    });
});

describe("malformed", () => {
    it("is retry later with status 502", () => {
        expect(malformed("PROCESSOR_ERROR", "m")).toEqual({
            ok: false,
            kind: "retry",
            status: 502,
            code: "PROCESSOR_ERROR",
            message: "m",
        });
    });
});

describe("requireValue", () => {
    it("returns the value", () => {
        expect(requireValue({ ok: true, value: 3 })).toBe(3);
    });

    it("returns null for a permanent failure", () => {
        expect(
            requireValue({
                ok: false,
                kind: "rejected",
                status: 404,
                code: "BEATMAP_NOT_FOUND",
                message: "m",
            }),
        ).toBeNull();
    });

    it("throws RetryLaterError for retry later", () => {
        expect(() =>
            requireValue(unreachable("BROKER_UNAVAILABLE", "down")),
        ).toThrow(RetryLaterError);
    });
});

describe("UpstreamError", () => {
    it("passes status and code through", () => {
        const error = UpstreamError.from({
            ok: false,
            kind: "rejected",
            status: 404,
            code: "VARIANT_NOT_FOUND",
            message: "No variant",
        });

        expect(error.statusCode).toBe(404);
        expect(error.toResponse()).toEqual({
            error: { code: "VARIANT_NOT_FOUND", message: "No variant" },
        });
    });
});

describe("requireValue configuration errors", () => {
    const rejected = (
        code: "UNAUTHORIZED" | "VARIANT_NOT_FOUND" | "BEATMAP_NOT_FOUND",
    ) =>
        ({
            ok: false,
            kind: "rejected",
            status: 401,
            code,
            message: "m",
        }) as const;

    it.each(["UNAUTHORIZED", "VARIANT_NOT_FOUND"] as const)(
        "retries later on rejected %s",
        (code) => {
            expect(() => requireValue(rejected(code))).toThrow(RetryLaterError);
            expect(() => requireValue(rejected(code))).toThrow(code);
        },
    );

    it("keeps other rejections permanent", () => {
        expect(requireValue(rejected("BEATMAP_NOT_FOUND"))).toBeNull();
    });
});
