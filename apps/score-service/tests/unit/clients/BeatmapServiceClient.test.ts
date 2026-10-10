import { BeatmapServiceClient } from "@/clients/BeatmapServiceClient";
import { startHttpServer } from "@dpp/server/testing";
import { testConfig } from "@test/utils/config";
import { describe, expect, it } from "vitest";

const hash = "b".repeat(32);

function metadata(overrides: Record<string, unknown> = {}) {
    return {
        file_md5: hash,
        artist: "Artist",
        title: "Title",
        creator: "Creator",
        version: "Version",
        approved: "1",
        ...overrides,
    };
}

async function stub(
    respond: (res: import("node:http").ServerResponse) => void,
) {
    const urls: string[] = [];
    const server = await startHttpServer((req, res) => {
        urls.push(req.url ?? "");
        respond(res);
    });

    return {
        server,
        urls,
        client: new BeatmapServiceClient({
            ...testConfig,
            beatmapService: {
                url: server.url,
                key: "priority-key",
                bulkKey: "bulk-key",
            },
        }),
    };
}

function json(status: number, payload: unknown) {
    return (res: import("node:http").ServerResponse) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(payload));
    };
}

describe("BeatmapServiceClient", () => {
    it("looks a beatmap up on the priority lane", async () => {
        const { server, urls, client } = await stub(json(200, metadata()));

        await using _server = server;

        expect(await client.getBeatmap("priority", hash)).toEqual({
            ok: true,
            value: {
                hash,
                title: "Artist - Title (Creator) [Version]",
                rankedStatus: 1,
            },
        });
        expect(urls).toEqual([`/getbeatmap?key=priority-key&hash=${hash}`]);
    });

    it("uses the bulk key on the bulk lane", async () => {
        const { server, urls, client } = await stub(json(200, metadata()));

        await using _server = server;

        await client.getBeatmap("bulk", hash);

        expect(urls).toEqual([`/getbeatmap?key=bulk-key&hash=${hash}`]);
    });

    it("returns null for a beatmap that does not exist", async () => {
        const { server, client } = await stub(
            json(404, { error: { message: "not found" } }),
        );

        await using _server = server;

        expect(await client.getBeatmap("priority", hash)).toEqual({
            ok: true,
            value: null,
        });
    });

    it("retries later on a refusal", async () => {
        const { server, client } = await stub((res) => {
            res.statusCode = 503;
            res.setHeader("Retry-After", "30");
            res.end("busy");
        });

        await using _server = server;

        expect(await client.getBeatmap("priority", hash)).toMatchObject({
            ok: false,
            kind: "retry",
            code: "BEATMAP_SERVICE_UNAVAILABLE",
            retryAfterMs: 30_000,
        });
    });

    it("rejects a body for a different beatmap", async () => {
        const { server, client } = await stub(
            json(200, metadata({ file_md5: "c".repeat(32) })),
        );

        await using _server = server;

        expect(await client.getBeatmap("priority", hash)).toMatchObject({
            ok: false,
            kind: "rejected",
            status: 502,
            code: "BEATMAP_SERVICE_UNAVAILABLE",
        });
    });

    it.each(["9", "ranked"])("rejects the status %s", async (approved) => {
        const { server, client } = await stub(
            json(200, metadata({ approved })),
        );

        await using _server = server;

        expect(await client.getBeatmap("priority", hash)).toMatchObject({
            ok: false,
            kind: "rejected",
            status: 502,
        });
    });
});
