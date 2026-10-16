import { DiscordMetadataClient } from "@/clients/DiscordMetadataClient";
import { startHttpServer } from "@dpp/server/testing";
import { testConfig } from "@test/utils/config";
import { describe, expect, it } from "vitest";

function clientFor(url: string) {
    return new DiscordMetadataClient({
        ...testConfig,
        discordMetadata: { url: `${url}/update`, key: "secret" },
    });
}

describe("DiscordMetadataClient", () => {
    it("posts the user id and key", async () => {
        const received: { url?: string; body: string }[] = [];

        await using server = await startHttpServer((req, res) => {
            let body = "";
            req.on("data", (chunk: Buffer) => (body += chunk.toString()));
            req.on("end", () => {
                received.push({ url: req.url, body });
                res.end("ok");
            });
        });

        expect(await clientFor(server.url).update("123")).toBe(true);
        expect(received).toHaveLength(1);
        expect(received[0]!.url).toBe("/update");
        expect(JSON.parse(received[0]!.body)).toEqual({
            key: "secret",
            userId: "123",
        });
    });

    it("returns false on a server error", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 500;
            res.end();
        });

        expect(await clientFor(server.url).update("123")).toBe(false);
    });

    it("returns false when the connection is refused", async () => {
        const server = await startHttpServer(() => undefined);
        const url = server.url;

        await server[Symbol.asyncDispose]();

        expect(await clientFor(url).update("123")).toBe(false);
    });
});
