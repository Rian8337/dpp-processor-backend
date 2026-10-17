import { findCaller } from "@/http/requestContext";
import { createAuthMiddleware } from "@/middleware/auth";
import type { ApiKeyRecord } from "@/registry/types";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

const bot: ApiKeyRecord = {
    id: 1,
    name: "bot",
    rateLimitPerMinute: null,
    allVariants: false,
    canActForUsers: false,
    grants: new Set(),
};

function createApp(allowAnonymous = true) {
    return express()
        .use(
            createAuthMiddleware(
                {
                    authenticate: (raw) =>
                        raw === "good-key" ? bot : undefined,
                },
                { allowAnonymous },
            ),
        )
        .get("/", (_req, res) => {
            res.json(findCaller(res));
        });
}

describe("auth middleware", () => {
    it("treats a request without a key as anonymous", async () => {
        const response = await request(createApp()).get("/").expect(200);

        expect(response.body).toEqual({ kind: "anonymous" });
    });

    it("requires a key when anonymous access is off", async () => {
        const rejected = await request(createApp(false)).get("/");

        expect(rejected.status).toBe(401);
        expect(rejected.body).toEqual({
            error: {
                code: "UNAUTHORIZED",
                message: "An API key is required",
            },
        });

        const accepted = await request(createApp(false))
            .get("/")
            .set("X-Api-Key", "good-key");

        expect(accepted.status).toBe(200);
    });

    it("attaches a valid key", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", "good-key")
            .expect(200);

        expect(response.body).toMatchObject({
            kind: "key",
            key: { name: "bot" },
        });
    });

    it.each(["", "wrong-key"])("rejects the key %j with 401", async (key) => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", key);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: {
                code: "UNAUTHORIZED",
                message: "Missing or invalid API key",
            },
        });
    });
});
