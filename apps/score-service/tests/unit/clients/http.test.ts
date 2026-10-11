import { requestJson } from "@/clients/http";
import { startHttpServer } from "@dpp/server/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({ value: z.number() });
const base = {
    timeoutMs: 1000,
    service: "Test",
    fallbackCode: "BROKER_UNAVAILABLE" as const,
    malformedCode: "PROCESSOR_ERROR" as const,
    isDefiniteRejection: () => true,
};

describe("requestJson", () => {
    it("sends JSON and parses the body", async () => {
        await using server = await startHttpServer((req, res) => {
            let body = "";
            req.on("data", (chunk: Buffer) => (body += chunk.toString()));
            req.on("end", () => {
                res.setHeader("Content-Type", "application/json");
                res.end(
                    JSON.stringify({
                        value: (JSON.parse(body) as { n: number }).n + 1,
                        extra: req.headers["x-api-key"],
                    }),
                );
            });
        });

        const result = await requestJson(
            {
                ...base,
                url: `${server.url}/x`,
                method: "POST",
                headers: { "X-Api-Key": "k" },
                body: { n: 1 },
            },
            z.looseObject({ value: z.number() }),
        );

        expect(result).toEqual({ ok: true, value: { value: 2, extra: "k" } });
    });

    it("passes an error body's code and message through", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    error: {
                        code: "VARIANT_NOT_FOUND",
                        message: "No variant x",
                    },
                }),
            );
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "rejected",
                status: 404,
                code: "VARIANT_NOT_FOUND",
                message: "No variant x",
            },
        );
    });

    it("uses the fallback code for an error without a readable body", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 503;
            res.setHeader("Retry-After", "3");
            res.end("busy");
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "retry",
                status: 503,
                code: "BROKER_UNAVAILABLE",
                message: "Test responded with status 503",
                retryAfterMs: 3000,
            },
        );
    });

    it("ignores an unknown error code", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 400;
            res.end(
                JSON.stringify({ error: { code: "WHATEVER", message: "m" } }),
            );
        });

        const result = await requestJson({ ...base, url: server.url }, schema);

        expect(result).toMatchObject({
            ok: false,
            kind: "rejected",
            code: "BROKER_UNAVAILABLE",
            message: "m",
        });
    });

    it("retries a rejection the caller does not consider definite", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 404;
            res.end("<html>nginx</html>");
        });

        const seen: [number, unknown][] = [];
        const result = await requestJson(
            {
                ...base,
                url: server.url,
                isDefiniteRejection: (status, body) => {
                    seen.push([status, body]);

                    return false;
                },
            },
            schema,
        );

        expect(seen).toEqual([[404, undefined]]);
        expect(result).toEqual({
            ok: false,
            kind: "retry",
            status: 404,
            code: "BROKER_UNAVAILABLE",
            message: "Test responded with status 404",
        });
    });

    it("treats a body of the wrong shape as retry later", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.end(JSON.stringify({ value: "nope" }));
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "retry",
                status: 502,
                code: "PROCESSOR_ERROR",
                message: "Test returned an unexpected response",
            },
        );
    });

    it("treats non-JSON success as retry later", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.end("<html>");
        });

        expect(
            await requestJson({ ...base, url: server.url }, schema),
        ).toMatchObject({
            ok: false,
            kind: "retry",
            status: 502,
        });
    });

    it("treats a refused connection as retry later", async () => {
        const server = await startHttpServer(() => undefined);
        const url = server.url;

        await server[Symbol.asyncDispose]();

        expect(await requestJson({ ...base, url }, schema)).toEqual({
            ok: false,
            kind: "retry",
            status: 503,
            code: "BROKER_UNAVAILABLE",
            message: "Test is unreachable",
        });
    });

    it("treats a timeout as retry later", async () => {
        await using server = await startHttpServer(() => undefined);

        expect(
            await requestJson(
                { ...base, url: server.url, timeoutMs: 100 },
                schema,
            ),
        ).toMatchObject({
            ok: false,
            kind: "retry",
            message: "Test did not respond in time",
        });
    });
});
