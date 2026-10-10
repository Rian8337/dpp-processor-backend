import type { UpstreamResult } from "@/types/upstream";
import type { RankedStatus } from "@rian8337/osu-base";

/**
 * `priority` is for interactive work, `bulk` for recalculation.
 */
export type BeatmapLane = "priority" | "bulk";

export interface BeatmapInfo {
    readonly hash: string;
    readonly title: string;
    readonly rankedStatus: RankedStatus;
}

export interface IBeatmapServiceClient {
    /**
     * `null` value: the beatmap does not exist (404).
     */
    getBeatmap(
        lane: BeatmapLane,
        hash: string,
    ): Promise<UpstreamResult<BeatmapInfo | null>>;
}
