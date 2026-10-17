import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { Modes } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import { z } from "zod";
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

/**
 * The rejections the broker and processors send about a request, by code with the statuses they come with. Any other
 * non-2xx response is retried: a proxy's error page, or another app's "Route not found" 404 (also `INVALID_REQUEST`)
 * at a wrong `BROKER_URL`, says nothing about the score. `UNAUTHORIZED` and `VARIANT_NOT_FOUND` are configuration
 * problems that callers wait out (see `isRetryLater`).
 */
const definiteRejections: ReadonlyMap<string, readonly number[]> = new Map([
    // 413: a body over the processor's size limit.
    ["INVALID_REQUEST", [400, 413]],
    ["UNAUTHORIZED", [401]],
    ["BEATMAP_NOT_FOUND", [404]],
    ["VARIANT_NOT_FOUND", [404]],
    ["INVALID_BEATMAP", [422]],
    ["INVALID_REPLAY", [422]],
    ["CALCULATION_FAILED", [500]],
]);

const errorBodySchema = z.object({ error: z.object({ code: z.string() }) });

function isDefiniteRejection(status: number, body: unknown): boolean {
    const parsed = errorBodySchema.safeParse(body);

    return (
        parsed.success &&
        (definiteRejections.get(parsed.data.error.code)?.includes(status) ??
            false)
    );
}

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
        actingUid?: number,
    ): Promise<UpstreamResult<PerformanceBody>> {
        return requestJson(
            this.request(variant, "/performance", "POST", actingUid, request),
            performanceBodySchema,
        );
    }

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
        actingUid?: number,
    ): Promise<UpstreamResult<ReplayPerformanceBody>> {
        return requestJson(
            this.request(
                variant,
                "/performance/replay",
                "POST",
                actingUid,
                request,
            ),
            replayPerformanceBodySchema,
        );
    }

    async variantMode(
        variant: string,
        actingUid?: number,
    ): Promise<UpstreamResult<Modes>> {
        const cacheKey = `${actingUid?.toString() ?? ""}:${variant}`;
        const cached = this.modes.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
            return { ok: true, value: cached.mode };
        }

        const result = await requestJson(
            this.request(variant, "", "GET", actingUid),
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

        this.modes.set(cacheKey, {
            mode: result.value.mode,
            expiresAt: Date.now() + modeCacheMs,
        });

        return { ok: true, value: result.value.mode };
    }

    private request(
        variant: string,
        path: string,
        method: "GET" | "POST",
        actingUid: number | undefined,
        body?: unknown,
    ): JsonRequest {
        return {
            url: `${this.config.broker.url}/variants/${encodeURIComponent(variant)}${path}`,
            method,
            headers: {
                "X-Api-Key": this.config.broker.apiKey,
                ...(actingUid !== undefined && {
                    "X-Acting-Uid": actingUid.toString(),
                }),
            },
            body,
            timeoutMs,
            service: "Broker",
            fallbackCode: "BROKER_UNAVAILABLE",
            malformedCode: "PROCESSOR_ERROR",
            isDefiniteRejection,
        };
    }
}
