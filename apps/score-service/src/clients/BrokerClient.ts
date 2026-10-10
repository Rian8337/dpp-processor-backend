import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { Modes } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import { requestJson, type JsonRequest } from "./http";
import type {
    IBrokerClient,
    PerformanceRequestInput,
    ReplayPerformanceRequestInput,
} from "./IBrokerClient";
import {
    performanceBodySchema,
    replayPerformanceBodySchema,
    variantSummarySchema,
    type PerformanceBody,
    type ReplayPerformanceBody,
} from "./schemas";

/**
 * Long enough for the broker's own retry of a slow processor (replay analysis with a strain chart).
 */
const timeoutMs = 70_000;
const modeCacheMs = 5 * 60 * 1000;

@Injectable(dependencyTokens.brokerClient)
export class BrokerClient implements IBrokerClient {
    private readonly modes = new Map<
        string,
        { mode: Modes; expiresAt: number }
    >();

    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    performance(
        variant: string,
        request: PerformanceRequestInput,
    ): Promise<UpstreamResult<PerformanceBody>> {
        return requestJson(
            this.request(variant, "/performance", "POST", request),
            performanceBodySchema,
        );
    }

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
    ): Promise<UpstreamResult<ReplayPerformanceBody>> {
        return requestJson(
            this.request(variant, "/performance/replay", "POST", request),
            replayPerformanceBodySchema,
        );
    }

    async variantMode(variant: string): Promise<UpstreamResult<Modes>> {
        const cached = this.modes.get(variant);

        if (cached && cached.expiresAt > Date.now()) {
            return { ok: true, value: cached.mode };
        }

        const result = await requestJson(
            this.request(variant, "", "GET"),
            variantSummarySchema,
        );

        if (!result.ok) {
            return result;
        }

        if (result.value.mode === null) {
            return {
                ok: false,
                kind: "retry",
                status: 503,
                code: "VARIANT_UNAVAILABLE",
                message: `Variant ${variant} has no available processor yet`,
            };
        }

        this.modes.set(variant, {
            mode: result.value.mode,
            expiresAt: Date.now() + modeCacheMs,
        });

        return { ok: true, value: result.value.mode };
    }

    private request(
        variant: string,
        path: string,
        method: "GET" | "POST",
        body?: unknown,
    ): JsonRequest {
        return {
            url: `${this.config.broker.url}/variants/${encodeURIComponent(variant)}${path}`,
            method,
            headers: { "X-Api-Key": this.config.broker.apiKey },
            body,
            timeoutMs,
            service: "Broker",
            fallbackCode: "BROKER_UNAVAILABLE",
            malformedCode: "PROCESSOR_ERROR",
        };
    }
}
