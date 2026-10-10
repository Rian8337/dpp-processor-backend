import { RetryLaterError, UpstreamError } from "@/types/errors";
import {
    failureFromResponse,
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

    it.each([400, 401, 403, 404, 422, 500])(
        "treats %i as rejected",
        (status) => {
            expect(
                failureFromResponse(response(status), "INTERNAL_ERROR", "m")
                    .kind,
            ).toBe("rejected");
        },
    );

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
