import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { startHttpServer, type TestHttpServer } from "@dpp/server/testing";
import type { IncomingMessage, ServerResponse } from "node:http";

async function readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }

    const text = Buffer.concat(chunks).toString();

    return text === "" ? null : (JSON.parse(text) as unknown);
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}

/**
 * A broker stand-in. Performance calls answer 90 when the request has a total score or a replay (the scored call)
 * and 100 otherwise (the no-penalty call), so the game routes answer `pp_multiplier` 0.9.
 */
export async function startStubBroker(): Promise<
    TestHttpServer & { readonly requests: { path: string; body: unknown }[] }
> {
    const requests: { path: string; body: unknown }[] = [];
    const server = await startHttpServer((request, response) => {
        void (async () => {
            const path = new URL(request.url ?? "/", "http://localhost")
                .pathname;
            const match = /^\/variants\/([^/]+)(\/.*)?$/.exec(path);

            if (!match) {
                sendJson(response, 404, {
                    error: { code: "NOT_FOUND", message: "No such route" },
                });
                return;
            }

            if (request.method === "GET" && !match[2]) {
                const name = decodeURIComponent(match[1]!);

                sendJson(response, 200, {
                    name,
                    mode: name.includes("osu") ? "osu" : "droid",
                });
                return;
            }

            const body = (await readJson(request)) as {
                score?: { totalScore?: number };
            } | null;

            requests.push({ path, body });

            if (match[2] === "/performance/replay") {
                sendJson(response, 200, replayPerformanceBody(90));
            } else if (match[2] === "/performance") {
                sendJson(
                    response,
                    200,
                    performanceBody(
                        body?.score?.totalScore === undefined ? 100 : 90,
                    ),
                );
            } else {
                sendJson(response, 404, {
                    error: { code: "NOT_FOUND", message: "No such route" },
                });
            }
        })();
    });

    return Object.assign(server, { requests });
}

/**
 * A beatmap service stand-in: every hash is a ranked beatmap titled "Artist - Title (Mapper) [Hard]".
 */
export function startStubBeatmapService(): Promise<TestHttpServer> {
    return startHttpServer((request, response) => {
        const hash = new URL(
            request.url ?? "/",
            "http://localhost",
        ).searchParams.get("hash");

        sendJson(response, 200, {
            file_md5: hash,
            artist: "Artist",
            title: "Title",
            creator: "Mapper",
            version: "Hard",
            // Ranked, in osu! API v1's string form.
            approved: "1",
        });
    });
}

/**
 * A Discord metadata endpoint that records request bodies.
 */
export async function startStubDiscord(): Promise<
    TestHttpServer & { readonly bodies: unknown[] }
> {
    const bodies: unknown[] = [];
    const server = await startHttpServer((request, response) => {
        void readJson(request).then((body) => {
            bodies.push(body);
            sendJson(response, 200, {});
        });
    });

    return Object.assign(server, { bodies });
}
