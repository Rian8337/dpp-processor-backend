import { testInfo } from "@test/utils/registry";
import { createServer } from "node:http";

export interface StubRequest {
    readonly path: string;
    readonly apiKey: string | undefined;
    readonly contentType: string | undefined;
    readonly body: string;
}

export interface StubReply {
    readonly status: number;
    readonly body: unknown;
}

/**
 * A stand-in for a processor: answers `GET /info` for its variant id and records calculation requests.
 */
export interface StubProcessor extends AsyncDisposable {
    readonly url: string;
    readonly requests: StubRequest[];
    reply(handler: (request: StubRequest) => StubReply): void;
    close(): Promise<void>;
}

export function startStubProcessor(id: string): Promise<StubProcessor> {
    const requests: StubRequest[] = [];
    let handler = (request: StubRequest): StubReply => ({
        status: 200,
        body: { route: request.path },
    });

    const server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/info") {
            res.writeHead(200, { "Content-Type": "application/json" }).end(
                JSON.stringify(testInfo(id)),
            );

            return;
        }

        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            const request: StubRequest = {
                path: req.url ?? "",
                apiKey: req.headers["x-api-key"]?.toString(),
                contentType: req.headers["content-type"],
                body: Buffer.concat(chunks).toString(),
            };

            requests.push(request);

            const reply = handler(request);

            res.writeHead(reply.status, {
                "Content-Type": "application/json",
            }).end(JSON.stringify(reply.body));
        });
    });

    const close = () =>
        new Promise<void>((resolve) => {
            if (!server.listening) {
                resolve();
                return;
            }

            server.closeAllConnections();
            server.close(() => resolve());
        });

    return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (!address || typeof address === "string") {
                reject(new Error("Stub processor has no TCP address"));
                return;
            }

            resolve({
                url: `http://127.0.0.1:${address.port.toString()}`,
                requests,
                reply: (next) => {
                    handler = next;
                },
                close,
                [Symbol.asyncDispose]: close,
            });
        });
    });
}
