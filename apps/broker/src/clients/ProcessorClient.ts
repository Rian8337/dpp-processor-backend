import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import type { ProcessorRoute } from "@dpp/shared";
import { inject } from "tsyringe";
import { describeFetchError, fetchInfo, isTimeout } from "./fetchInfo";
import type {
    ForwardResult,
    InfoResult,
    IProcessorClient,
} from "./IProcessorClient";
import { createTimeout } from "./timeout";

@Injectable(dependencyTokens.processorClient)
export class ProcessorClient implements IProcessorClient {
    constructor(
        @inject(dependencyTokens.config)
        private readonly config: Config,
    ) {}

    getInfo(baseUrl: string, timeoutMs: number): Promise<InfoResult> {
        return fetchInfo(baseUrl, timeoutMs);
    }

    async forward(
        baseUrl: string,
        route: ProcessorRoute,
        body: Buffer,
        timeoutMs: number,
    ): Promise<ForwardResult> {
        // One signal for the whole exchange, so a slow body counts against the same timeout.
        using timeout = createTimeout(timeoutMs);
        let response: Response;

        try {
            response = await fetch(`${baseUrl}${route}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": this.config.processor.apiKey,
                },
                body,
                signal: timeout.signal,
            });
        } catch (e) {
            return isTimeout(e)
                ? { kind: "timeout" }
                : { kind: "connection-failed", reason: describeFetchError(e) };
        }

        try {
            return {
                kind: "response",
                status: response.status,
                contentType: response.headers.get("content-type"),
                body: Buffer.from(await response.arrayBuffer()),
            };
        } catch (e) {
            return isTimeout(e)
                ? { kind: "timeout" }
                : { kind: "broken", reason: describeFetchError(e) };
        }
    }
}
