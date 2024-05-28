import { RankedStatus } from "@rian8337/osu-base";

/**
 * Represents a beatmap in the processor's database.
 */
export interface ProcessorDatabaseBeatmap {
    /**
     * The ID of the beatmap.
     */
    readonly id: number;

    /**
     * The MD5 hash of the beatmap.
     */
    readonly hash: string;

    /**
     * The ranked status of the beatmap.
     */
    readonly ranked_status: RankedStatus;
}
