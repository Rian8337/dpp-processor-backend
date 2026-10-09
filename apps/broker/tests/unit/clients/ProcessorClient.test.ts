import { ProcessorClient } from "@/clients/ProcessorClient";
import { freePort } from "@dpp/server/testing";
import { testConfig, testProcessorApiKey } from "@test/utils/config";
import { startHttpServer } from "@test/utils/httpServer";
import { testInfo } from "@test/utils/registry";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const client = new ProcessorClient(testConfig);

afterEach(() => {
    vi.useRealTimers();
});

/**
 * Fakes only setTimeout/clearTimeout, which the client's timeout uses, so the real sockets keep working.
 */
function fakeTimeoutTimers(): void {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

/**
 * Lets real socket I/O progress. `setImmediate` is not faked by {@link fakeTimeoutTimers}.
 */
async function realTicks(count = 20): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    });
}

describe("ProcessorClient.getInfo", () => {
    it("returns the parsed /info response", async () => {
        await using server = await startHttpServer((req, res) => {
            res.writeHead(req.url === "/info" ? 200 : 404, {
                "Content-Type": "application/json",
            }).end(JSON.stringify(testInfo("droid-live")));
        });

        expect(await client.getInfo(server.url, 1000)).toEqual({
            kind: "ok",
            info: testInfo("droid-live"),
        });
    });

    it.each([
        ["a non-2xx status", 503, JSON.stringify({}), /503/],
        [
            "an unexpected body",
            200,
            JSON.stringify({ id: 1 }),
            /unexpected body/,
        ],
        ["invalid JSON", 200, "{", /./],
    ])("fails on %s", async (_case, status, body, reason) => {
        await using server = await startHttpServer((_req, res) => {
            res.writeHead(status, { "Content-Type": "application/json" }).end(
                body,
            );
        });

        const result = await client.getInfo(server.url, 1000);

        expect(result.kind).toBe("failed");
        expect(result.kind === "failed" && result.reason).toMatch(reason);
    });

    it("fails when nothing listens", async () => {
        const port = await freePort();
        const result = await client.getInfo(
            `http://127.0.0.1:${port.toString()}`,
            1000,
        );

        expect(result.kind).toBe("failed");
    });

    it("fails with 'timed out' when the processor does not answer in time", async () => {
        await using server = await startHttpServer(() => {
            // Never respond.
        });

        fakeTimeoutTimers();

        const result = client.getInfo(server.url, 3000);

        await vi.advanceTimersByTimeAsync(3000);

        expect(await result).toEqual({
            kind: "failed",
            reason: "timed out",
        });
    });
});

describe("ProcessorClient.forward", () => {
    it("posts the body with the processor key and returns the response unchanged", async () => {
        const seen: {
            method?: string;
            url?: string;
            key?: string;
            type?: string;
            body?: string;
        } = {};

        await using server = await startHttpServer(async (req, res) => {
            seen.method = req.method;
            seen.url = req.url;
            seen.key = req.headers["x-api-key"]?.toString();
            seen.type = req.headers["content-type"];
            seen.body = await readBody(req);

            res.writeHead(500, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                    error: { code: "CALCULATION_FAILED", message: "boom" },
                }),
            );
        });

        const body = Buffer.from(JSON.stringify({ beatmap: { id: 1 } }));
        const result = await client.forward(
            server.url,
            "/performance/replay",
            body,
            1000,
        );

        expect(seen).toEqual({
            method: "POST",
            url: "/performance/replay",
            key: testProcessorApiKey,
            type: "application/json",
            body: body.toString(),
        });
        expect(result).toMatchObject({
            kind: "response",
            status: 500,
            contentType: "application/json",
        });
        expect(
            result.kind === "response" && JSON.parse(result.body.toString()),
        ).toEqual({
            error: { code: "CALCULATION_FAILED", message: "boom" },
        });
    });

    it("reports a refused connection as connection-failed", async () => {
        const port = await freePort();

        expect(
            await client.forward(
                `http://127.0.0.1:${port.toString()}`,
                "/difficulty",
                Buffer.from("{}"),
                1000,
            ),
        ).toMatchObject({ kind: "connection-failed" });
    });

    it("reports a slow processor as a timeout", async () => {
        let markReceived = (): void => undefined;
        const received = new Promise<void>((r) => (markReceived = r));

        await using server = await startHttpServer(() => {
            // Never respond.
            markReceived();
        });

        fakeTimeoutTimers();

        const result = client.forward(
            server.url,
            "/difficulty",
            Buffer.from("{}"),
            3000,
        );

        await received;
        await vi.advanceTimersByTimeAsync(2999);

        let settled = false;

        void result.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(await result).toEqual({ kind: "timeout" });
    });

    it("counts a slow body against the same timeout", async () => {
        let markSent = (): void => undefined;
        const sent = new Promise<void>((r) => (markSent = r));

        await using server = await startHttpServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write("{", () => markSent());
            // Never finish the body.
        });

        fakeTimeoutTimers();

        const result = client.forward(
            server.url,
            "/difficulty",
            Buffer.from("{}"),
            3000,
        );

        // Let the client receive the headers, so the timeout fires during the body read.
        await sent;
        await realTicks();

        let settled = false;

        void result.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(2999);

        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(await result).toEqual({ kind: "timeout" });
    });

    it("reports a response cut off mid-body as broken", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Content-Length": "100",
            });
            res.write("{");
            setTimeout(() => res.socket?.destroy(), 20);
        });

        expect(
            await client.forward(
                server.url,
                "/difficulty",
                Buffer.from("{}"),
                1000,
            ),
        ).toMatchObject({ kind: "broken" });
    });
});
