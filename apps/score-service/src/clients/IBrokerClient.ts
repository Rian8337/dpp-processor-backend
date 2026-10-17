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
 * Calls processors through the broker. With `actingUid`, a call is made on behalf of that person (`X-Acting-Uid`), so
 * the broker only offers the variants that person may use; this needs a broker key with `can_act_for_users`.
 */
export interface IBrokerClient {
    performance(
        variant: string,
        request: PerformanceRequestInput,
        actingUid?: number,
    ): Promise<UpstreamResult<PerformanceBody>>;

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
        actingUid?: number,
    ): Promise<UpstreamResult<ReplayPerformanceBody>>;

    /**
     * The variant's mode from `GET /variants/:name`, cached for 5 minutes per acting uid. A variant with no mode yet
     * is "retry later".
     */
    variantMode(
        variant: string,
        actingUid?: number,
    ): Promise<UpstreamResult<Modes>>;
}
