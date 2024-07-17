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
    hash: string;

    /**
     * The title of the beatmap.
     */
    title: string;

    /**
     * The duration of the beatmap not including breaks.
     */
    hit_length: number;

    /**
     * The duration of the beatmap including breaks.
     */
    total_length: number;

    /**
     * The maximum combo of the beatmap.
     *
     * May be `null` in graveyarded beatmaps.
     */
    max_combo: number | null;

    /**
     * The amount of objects in the beatmap.
     */
    object_count: number;

    /**
     * The ranked status of the beatmap.
     */
    ranked_status: RankedStatus;

    /**
     * The last time the beatmap was checked.
     */
    last_checked: Date;
}
