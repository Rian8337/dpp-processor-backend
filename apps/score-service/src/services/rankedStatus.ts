import type { BeatmapInfo } from "@/clients/IBeatmapServiceClient";
import { RankedStatus } from "@rian8337/osu-base";

const ppStatuses = new Set([RankedStatus.Ranked, RankedStatus.Approved]);

/**
 * Why scores on a beatmap earn no pp, or null if they do. Only ranked and approved beatmaps award pp.
 */
export function noPPReason(beatmap: BeatmapInfo | null): string | null {
    if (!beatmap) {
        return "beatmap not found";
    }

    return ppStatuses.has(beatmap.rankedStatus)
        ? null
        : `beatmap not ranked or approved (status ${beatmap.rankedStatus.toString()})`;
}
