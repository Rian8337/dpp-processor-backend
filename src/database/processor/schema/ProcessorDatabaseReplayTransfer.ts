/**
 * Represents a beatmap in the processor's database.
 */
export interface ProcessorDatabaseReplayTransfer {
    /**
     * The currently transferring player's ID.
     */
    player_id: number;

    /**
     * The MD5 hash of the beatmap being transferred.
     */
    hash: string;
}
