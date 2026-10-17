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

const actor: ApiKeyRecord = {
    ...bot,
    id: 2,
    name: "board",
    canActForUsers: true,
};

function createApp(allowAnonymous = true) {
    return express()
        .use(
            createAuthMiddleware(
                {
                    authenticate: (raw) =>
                        raw === "good-key"
                            ? bot
                            : raw === "actor-key"
                              ? actor
                              : undefined,
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

    it("attaches the acting uid for a key that can act for users", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", "actor-key")
            .set("X-Acting-Uid", "1001")
            .expect(200);

        expect(response.body).toMatchObject({
            kind: "key",
            key: { name: "board" },
            actingUid: 1001,
        });
    });

    it("leaves the acting uid unset when the header is absent", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", "actor-key")
            .expect(200);

        expect(response.body).not.toHaveProperty("actingUid");
    });

    it("rejects an acting uid from a key that cannot act for users", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", "good-key")
            .set("X-Acting-Uid", "1001");

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "This key cannot act for users",
            },
        });
    });

    it("rejects an acting uid without a key", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Acting-Uid", "1001");

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "This key cannot act for users",
            },
        });
    });

    it.each(["0", "-1", "1.5", "abc", "", "2147483648", "01"])(
        "rejects the acting uid %j",
        async (uid) => {
            const response = await request(createApp())
                .get("/")
                .set("X-Api-Key", "actor-key")
                .set("X-Acting-Uid", uid);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                error: {
                    code: "INVALID_REQUEST",
                    message: "X-Acting-Uid must be a positive integer",
                },
            });
        },
    );

    it("accepts the largest acting uid", async () => {
        const response = await request(createApp())
            .get("/")
            .set("X-Api-Key", "actor-key")
            .set("X-Acting-Uid", "2147483647")
            .expect(200);

        expect(response.body).toMatchObject({ actingUid: 2147483647 });
    });
});
