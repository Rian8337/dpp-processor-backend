import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, notFoundHandler } from "../../src/http/errorHandlers";

function createApp() {
    return express()
        .use(express.json({ limit: 10 }))
        .post("/echo", (req, res) => {
            res.json(req.body);
        })
        .get("/throw", () => {
            throw new Error("secret detail");
        })
        .use(notFoundHandler)
        .use(errorHandler);
}

describe("error handlers", () => {
    it("answers unknown routes with the JSON error shape", async () => {
        const response = await request(createApp()).get("/nope");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: { code: "INVALID_REQUEST", message: "Route not found" },
        });
    });

    it("maps body parser errors to INVALID_REQUEST with their status", async () => {
        const invalid = await request(createApp())
            .post("/echo")
            .set("Content-Type", "application/json")
            .send("{");
        const tooLarge = await request(createApp())
            .post("/echo")
            .send({ long: "0123456789" });

        expect(invalid.status).toBe(400);
        expect(invalid.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "Request body is not valid JSON",
            },
        });
        expect(tooLarge.status).toBe(413);
        expect(tooLarge.body).toEqual({
            error: {
                code: "INVALID_REQUEST",
                message: "Request body is too large",
            },
        });
    });

    it("hides details of unexpected errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const response = await request(createApp()).get("/throw");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
    });
});
