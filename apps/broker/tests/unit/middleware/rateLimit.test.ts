import { setCaller } from "@/http/requestContext";
import { createRateLimitMiddleware } from "@/middleware/rateLimit";
import { anonymousCaller } from "@/registry/snapshot";
import type { ApiKeyRecord, Caller } from "@/registry/types";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const key = (id: number, rateLimitPerMinute: number | null): ApiKeyRecord => ({
    id,
    name: `key-${id.toString()}`,
    rateLimitPerMinute,
    allVariants: false,
    grants: new Set(),
});

const callers: Record<string, Caller> = {
    limited: { kind: "key", key: key(1, 2) },
    other: { kind: "key", key: key(2, 2) },
    unlimited: { kind: "key", key: key(3, null) },
};

function createApp(recordRateLimited = vi.fn<(caller: string) => void>()) {
    return express()
        .use((req, res, next) => {
            const name = req.get("x-caller");

            setCaller(res, (name && callers[name]) || anonymousCaller);
            next();
        })
        .use(
            createRateLimitMiddleware({
                anonymousLimit: 1,
                usage: { recordRateLimited },
            }),
        )
        .get("/", (_req, res) => {
            res.json({ ok: true });
        });
}

describe("rate limit middleware", () => {
    it("limits each key by its own per-minute limit, with standard headers", async () => {
        const recordRateLimited = vi.fn<(caller: string) => void>();
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        const app = createApp(recordRateLimited);
        const send = (caller: string) =>
            request(app).get("/").set("X-Caller", caller);

        expect(
            (await send("limited")).headers["ratelimit-policy"],
        ).toBeDefined();
        await send("limited").expect(200);
        await send("limited").expect(429, {
            error: {
                code: "RATE_LIMITED",
                message:
                    "Too many requests; the RateLimit headers say when to retry",
            },
        });
        await send("other").expect(200);
        expect(recordRateLimited).toHaveBeenCalledWith("key-1");
        expect(warn).toHaveBeenCalledWith("Rate limit reached by key key-1");
    });

    it("never limits unlimited keys", async () => {
        const app = createApp();

        for (let i = 0; i < 10; i++) {
            const response = await request(app)
                .get("/")
                .set("X-Caller", "unlimited");

            expect(response.status).toBe(200);
            expect(response.headers["ratelimit-policy"]).toBeUndefined();
        }
    });

    it("limits anonymous callers per IP without logging each rejection", async () => {
        const recordRateLimited = vi.fn<(caller: string) => void>();
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);
        const app = createApp(recordRateLimited);

        await request(app).get("/").expect(200);
        await request(app).get("/").expect(429);
        expect(recordRateLimited).toHaveBeenCalledWith("anonymous");
        expect(warn).not.toHaveBeenCalled();
    });
});
