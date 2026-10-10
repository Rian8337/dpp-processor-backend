import type { UpstreamResult } from "@/types/upstream";
import type {
    performanceRequestSchema,
    replayPerformanceRequestSchema,
} from "@dpp/shared";
import type { Modes } from "@rian8337/osu-base";
import type { z } from "zod";
import type { PerformanceBody, ReplayPerformanceBody } from "./schemas";

export type PerformanceRequestInput = z.input<typeof performanceRequestSchema>;
export type ReplayPerformanceRequestInput = z.input<
    typeof replayPerformanceRequestSchema
>;

/**
 * Calls processors through the broker.
 */
export interface IBrokerClient {
    performance(
        variant: string,
        request: PerformanceRequestInput,
    ): Promise<UpstreamResult<PerformanceBody>>;

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
    ): Promise<UpstreamResult<ReplayPerformanceBody>>;

    /**
     * The variant's mode from `GET /variants/:name`, cached for 5 minutes. A variant with no mode yet is "retry later".
     */
    variantMode(variant: string): Promise<UpstreamResult<Modes>>;
}
