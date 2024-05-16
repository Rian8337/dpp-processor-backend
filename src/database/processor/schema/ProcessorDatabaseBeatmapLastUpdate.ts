/**
 * Represents beatmap last update dates that are in the processor's database.
 */
export interface ProcessorDatabaseBeatmapLastUpdate {
    /**
     * The ID of the beatmap.
     */
    readonly id: number;

    /**
     * The date at which the beatmap was last updated.
     */
    readonly last_update: Date;
}
