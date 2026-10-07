import { BeatmapServiceClient } from "@/clients/BeatmapServiceClient";
import type { Config } from "@/config/config";
import { ServiceUnavailableError } from "@/types/errors";
import { afterEach, describe, expect, it, vi } from "vitest";

const config: Config = {
    port: 3006,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    beatmapService: {
        url: "http://beatmaps.local/api/beatmap",
        key: "beatmap-key",
    },
    apiKey: "0123456789abcdef",
    calculation: { threads: 0, maxQueue: 100 },
};

function stubFetch(response: Response | Error) {
    const fetchMock = vi.fn<typeof fetch>(() =>
        response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response),
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
    const input = fetchMock.mock.calls[0]?.[0];

    return new URL(input instanceof Request ? input.url : String(input));
}

describe("BeatmapServiceClient", () => {
    const client = new BeatmapServiceClient(config);

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("requests metadata by ID with the key and maps the response", async () => {
        const fetchMock = stubFetch(
            Response.json({
                beatmap_id: "75",
                file_md5: "0123456789abcdef0123456789abcdef",
                title: "x",
            }),
        );

        expect(await client.getBeatmap({ id: 75 })).toEqual({
            id: 75,
            hash: "0123456789abcdef0123456789abcdef",
        });

        const url = requestedUrl(fetchMock);
        expect(url.pathname).toBe("/api/beatmap/getbeatmap");
        expect(url.searchParams.get("id")).toBe("75");
        expect(url.searchParams.get("key")).toBe("beatmap-key");
    });

    it("requests metadata by hash", async () => {
        const fetchMock = stubFetch(
            Response.json({ beatmap_id: "1", file_md5: "a".repeat(32) }),
        );

        await client.getBeatmap({ hash: "a".repeat(32) });

        expect(requestedUrl(fetchMock).searchParams.get("hash")).toBe(
            "a".repeat(32),
        );
    });

    it("returns null on 404", async () => {
        stubFetch(new Response("missing", { status: 404 }));
        expect(await client.getBeatmap({ id: 1 })).toBeNull();

        stubFetch(new Response("missing", { status: 404 }));
        expect(await client.getBeatmapFile(1)).toBeNull();
    });

    it.each([404, 500])(
        "cancels the unread body of a %i response",
        async (status) => {
            let cancelled = false;
            const body = new ReadableStream<Uint8Array>({
                cancel: () => {
                    cancelled = true;
                },
            });

            stubFetch(new Response(body, { status }));

            await client.getBeatmapFile(1).catch(() => null);

            expect(cancelled).toBe(true);
        },
    );

    it("returns file bytes unchanged", async () => {
        const bytes = Buffer.from("﻿osu file format v14");
        stubFetch(new Response(bytes));

        expect(await client.getBeatmapFile(1)).toEqual(bytes);
    });

    it.each([
        ["a server error", new Response("oops", { status: 500 })],
        ["a network error", new TypeError("fetch failed")],
        [
            "a timeout",
            new DOMException("The operation timed out", "TimeoutError"),
        ],
    ])("throws BEATMAP_SERVICE_UNAVAILABLE on %s", async (_, response) => {
        stubFetch(response);

        await expect(client.getBeatmap({ id: 1 })).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );
    });

    it.each([
        ["a non-JSON body", new Response("<html>oops</html>")],
        ["a missing hash", Response.json({ beatmap_id: "1" })],
        [
            "an invalid hash",
            Response.json({ beatmap_id: "1", file_md5: "XYZ" }),
        ],
        [
            "an uppercase hash",
            Response.json({ beatmap_id: "1", file_md5: "A".repeat(32) }),
        ],
        [
            "a non-numeric beatmap ID",
            Response.json({ beatmap_id: "abc", file_md5: "a".repeat(32) }),
        ],
        [
            "a non-positive beatmap ID",
            Response.json({ beatmap_id: "0", file_md5: "a".repeat(32) }),
        ],
    ])("throws BEATMAP_SERVICE_UNAVAILABLE on %s", async (_, response) => {
        stubFetch(response);

        await expect(client.getBeatmap({ id: 1 })).rejects.toMatchObject({
            code: "BEATMAP_SERVICE_UNAVAILABLE",
        });
    });

    it("throws BEATMAP_SERVICE_UNAVAILABLE when reading the body fails", async () => {
        const body = new ReadableStream<Uint8Array>({
            pull: (controller) => {
                controller.error(new TypeError("terminated"));
            },
        });

        stubFetch(new Response(body));
        await expect(client.getBeatmap({ id: 1 })).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );

        stubFetch(
            new Response(
                new ReadableStream<Uint8Array>({
                    pull: (controller) => {
                        controller.error(new TypeError("terminated"));
                    },
                }),
            ),
        );
        await expect(client.getBeatmapFile(1)).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );
    });
});
