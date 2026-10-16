import { setCaller, setVariantName } from "@/http/requestContext";
import { createUsageMiddleware } from "@/middleware/usage";
import { anonymousCaller } from "@/registry/snapshot";
import type { IUsageStats } from "@/services/IUsageStats";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

describe("usage middleware", () => {
    it("records each finished request and logs 5xx responses", async () => {
        const record = vi.fn<IUsageStats["record"]>();
        const error = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const app = express()
            .use(createUsageMiddleware({ record }))
            .get("/ok", (_req, res) => {
                setCaller(res, anonymousCaller);
                setVariantName(res, "droid-live");
                res.json({});
            })
            .get("/rejected", (_req, res) => {
                res.status(401).json({});
            })
            .get("/failed", (_req, res) => {
                setCaller(res, anonymousCaller);
                res.status(502).json({});
            });

        await request(app).get("/ok").expect(200);
        await request(app).get("/rejected").expect(401);
        await request(app).get("/failed").expect(502);

        expect(
            record.mock.calls.map(([call]) => [
                call.variant,
                call.caller,
                call.status,
            ]),
        ).toEqual([
            ["droid-live", "anonymous", 200],
            [null, "unauthenticated", 401],
            [null, "anonymous", 502],
        ]);
        expect(record.mock.calls[0]?.[0].durationMs).toBeGreaterThanOrEqual(0);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
            "GET /failed answered 502 (variant -, caller anonymous)",
        );
    });
});
