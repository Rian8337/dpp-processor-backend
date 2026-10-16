import { BrokerClient } from "@/clients/BrokerClient";
import { startHttpServer } from "@dpp/server/testing";
import { Modes } from "@rian8337/osu-base";
import { testConfig } from "@test/utils/config";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const hash = "a".repeat(32);

interface Recorded {
    readonly method: string | undefined;
    readonly url: string | undefined;
    readonly apiKey: string | string[] | undefined;
    readonly body: string;
}

async function stub(respond: (path: string) => [number, unknown]) {
    const requests: Recorded[] = [];
    const server = await startHttpServer((req: IncomingMessage, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk.toString()));
        req.on("end", () => {
            requests.push({
                method: req.method,
                url: req.url,
                apiKey: req.headers["x-api-key"],
                body,
            });

            const [status, payload] = respond(req.url ?? "");

            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
        });
    });

    return {
        server,
        requests,
        client: new BrokerClient({
            ...testConfig,
            broker: { url: server.url, apiKey: "broker-key" },
        }),
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("BrokerClient", () => {
    it("posts a performance request and keeps unknown fields", async () => {
        const { server, requests, client } = await stub(() => [
            200,
            performanceBody(123, { foo: 1 }),
        ]);

        await using _server = server;

        const request = {
            beatmap: { hash },
            mods: [],
            score: { n300: 1 },
        };
        const result = await client.performance("live-droid", request);

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            method: "POST",
            url: "/variants/live-droid/performance",
            apiKey: "broker-key",
        });
        expect(JSON.parse(requests[0]!.body)).toEqual(request);
        expect(result).toMatchObject({
            ok: true,
            value: { performance: { total: 123 }, foo: 1 },
        });
    });

    it("posts a replay request and requires the replay field", async () => {
        const { server, requests, client } = await stub(() => [
            200,
            replayPerformanceBody(5),
        ]);

        await using _server = server;

        expect(
            (await client.replayPerformance("x", { replay: "AAAA" })).ok,
        ).toBe(true);
        expect(requests[0]!.url).toBe("/variants/x/performance/replay");

        const missing = await stub(() => [200, performanceBody(5)]);

        await using _missing = missing.server;

        expect(
            await missing.client.replayPerformance("x", { replay: "AAAA" }),
        ).toMatchObject({
            ok: false,
            kind: "retry",
            status: 502,
            code: "PROCESSOR_ERROR",
        });
    });

    it("encodes the variant name in the path", async () => {
        const { server, requests, client } = await stub(() => [
            200,
            performanceBody(1),
        ]);

        await using _server = server;

        await client.performance("a b", { beatmap: { hash } });

        expect(requests[0]!.url).toBe("/variants/a%20b/performance");
    });

    it("reads a variant's mode and caches it for five minutes", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });

        const { server, requests, client } = await stub(() => [
            200,
            { name: "live-osu", mode: Modes.Osu },
        ]);

        await using _server = server;

        expect(await client.variantMode("live-osu")).toEqual({
            ok: true,
            value: Modes.Osu,
        });
        expect(requests[0]).toMatchObject({
            method: "GET",
            url: "/variants/live-osu",
            apiKey: "broker-key",
        });

        await client.variantMode("live-osu");
        expect(requests).toHaveLength(1);

        vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
        await client.variantMode("live-osu");
        expect(requests).toHaveLength(2);
    });

    it("treats a variant without a mode as retry later and does not cache it", async () => {
        const { server, requests, client } = await stub(() => [
            200,
            { name: "v", mode: null },
        ]);

        await using _server = server;

        const expected = {
            ok: false,
            kind: "retry",
            status: 503,
            code: "VARIANT_UNAVAILABLE",
        };

        expect(await client.variantMode("v")).toMatchObject(expected);
        expect(await client.variantMode("v")).toMatchObject(expected);
        expect(requests).toHaveLength(2);
    });

    it("rejects an unknown variant and does not cache it", async () => {
        const { server, requests, client } = await stub(() => [
            404,
            { error: { code: "VARIANT_NOT_FOUND", message: "No variant v" } },
        ]);

        await using _server = server;

        const expected = {
            ok: false,
            kind: "rejected",
            status: 404,
            code: "VARIANT_NOT_FOUND",
        };

        expect(await client.variantMode("v")).toMatchObject(expected);
        expect(await client.variantMode("v")).toMatchObject(expected);
        expect(requests).toHaveLength(2);
    });

    it.each([
        [400, "INVALID_REQUEST"],
        [413, "INVALID_REQUEST"],
        [401, "UNAUTHORIZED"],
        [404, "BEATMAP_NOT_FOUND"],
        [422, "INVALID_BEATMAP"],
        [422, "INVALID_REPLAY"],
        [500, "CALCULATION_FAILED"],
    ])("treats %i %s as a definite answer", async (status, code) => {
        const { server, client } = await stub(() => [
            status,
            { error: { code, message: "m" } },
        ]);

        await using _server = server;

        expect(
            await client.performance("v", {
                beatmap: { hash },
                mods: [],
                score: {},
            }),
        ).toMatchObject({ ok: false, kind: "rejected", status, code });
    });

    it.each<[string, number, unknown]>([
        [
            "another app's Route not found",
            404,
            { error: { code: "INVALID_REQUEST", message: "Route not found" } },
        ],
        ["a proxy's 404 page", 404, "<html>nginx</html>"],
        ["a proxy's 403 page", 403, "<html>forbidden</html>"],
        [
            "a known code with an unexpected status",
            404,
            { error: { code: "INVALID_REPLAY", message: "m" } },
        ],
        ["an unknown code", 400, { error: { code: "WHATEVER", message: "m" } }],
        [
            "a rate limit",
            429,
            { error: { code: "RATE_LIMITED", message: "m" } },
        ],
    ])("retries %s", async (_, status, payload) => {
        const { server, client } = await stub(() => [status, payload]);

        await using _server = server;

        expect(
            await client.performance("v", {
                beatmap: { hash },
                mods: [],
                score: {},
            }),
        ).toMatchObject({ ok: false, kind: "retry", status });
    });
});
