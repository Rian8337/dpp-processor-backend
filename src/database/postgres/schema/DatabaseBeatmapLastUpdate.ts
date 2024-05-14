/**
 * Represents beatmap last update dates that are in the database.
 */
export interface DatabaseBeatmapLastUpdate {
    /**
     * The ID of the beatmap.
     */
    readonly id: number;

    /**
     * The date at which the beatmap was last updated.
     */
    readonly last_update: Date;
}
