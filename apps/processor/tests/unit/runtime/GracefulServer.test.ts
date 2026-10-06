import { GracefulServer } from "@/runtime/GracefulServer";
import express from "express";
import { Agent, request } from "node:http";
import { describe, expect, it } from "vitest";

function get(agent: Agent, port: number): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        request({ agent, port, host: "127.0.0.1", path: "/slow" }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.headers.connection));
        })
            .on("error", reject)
            .end();
    });
}

describe("GracefulServer", () => {
    it("shuts down while a keep-alive client keeps sending requests", async () => {
        const server = new GracefulServer();
        const app = express()
            .use(server.middleware)
            .get("/slow", (_req, res) => {
                setTimeout(() => res.send("ok"), 20);
            });

        const port = await server.listen(app, 0);

        using agent = keepAliveAgent();
        let stop = false;
        let served = 0;

        const client = (async () => {
            while (!stop) {
                try {
                    await get(agent, port);
                    served++;
                } catch {
                    return;
                }
            }
        })();

        await expect.poll(() => served).toBeGreaterThan(2);

        const disposed = server[Symbol.asyncDispose]();

        await expect(
            Promise.race([
                disposed.then(() => "closed"),
                new Promise((resolve) => setTimeout(resolve, 2000, "timeout")),
            ]),
        ).resolves.toBe("closed");

        stop = true;
        await client;
    });

    it("finishes the in-flight request, then closes its keep-alive connection", async () => {
        const server = new GracefulServer();
        let markReceived: () => void = () => undefined;
        const received = new Promise<void>((resolve) => {
            markReceived = resolve;
        });
        let requests = 0;
        const app = express()
            .use(server.middleware)
            .get("/slow", (_req, res) => {
                if (++requests === 2) {
                    markReceived();
                }

                setTimeout(() => res.send("ok"), 100);
            });

        const port = await server.listen(app, 0);

        using agent = keepAliveAgent();

        await get(agent, port);

        const inFlight = get(agent, port);

        await received;

        const disposed = server[Symbol.asyncDispose]();

        // The in-flight request still completes, and the connection is closed afterwards.
        await expect(inFlight).resolves.toBeDefined();
        await expect(disposed).resolves.toBeUndefined();
    });

    it("disposing a server that never listened does nothing", async () => {
        await expect(
            new GracefulServer()[Symbol.asyncDispose](),
        ).resolves.toBeUndefined();
    });
});

function keepAliveAgent(): Agent & Disposable {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });

    return Object.assign(agent, { [Symbol.dispose]: () => agent.destroy() });
}
