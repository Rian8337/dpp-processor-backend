/**
 * Represents beatmap hashes that are in the database.
 */
export interface DatabaseBeatmapHash {
    /**
     * The ID of the beatmap.
     */
    readonly id: number;

    /**
     * The MD5 hash of the beatmap.
     */
    readonly hash: string;
}
