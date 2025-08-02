import { IBeatmap } from "@/database/processor/schema";

/**
 * Provides operations for interacting with beatmaps in the processor database.
 */
export interface IBeatmapRepository {
    /**
     * Retrieves a beatmap by its ID. If the beatmap is not available, it will be fetched from the beatmap processor.
     *
     * @param idOrHash The beatmap ID or MD5 hash of the beatmap.
     * @returns The beatmap object or `null` if not found.
     */
    getBeatmap(idOrHash: number | string): Promise<IBeatmap | null>;

    /**
     * Inserts new beatmaps into the database. If a beatmap with the same ID already exists, it will be updated.
     *
     * @param beatmaps The beatmaps to insert.
     * @returns Whether the insertion was successful.
     */
    insert(...beatmaps: IBeatmap[]): Promise<boolean>;

    /**
     * Deletes a beatmap by its ID.
     *
     * @param id The ID of the beatmap to delete.
     * @returns Whether the deletion was successful.
     */
    delete(id: number): Promise<boolean>;

    /**
     * Updates the last checked time of a beatmap to the current time.
     *
     * @param id The ID of the beatmap.
     * @returns Whether the update was successful.
     */
    refreshCheckDate(id: number): Promise<boolean>;

    /**
     * Updates the maximum combo of a beatmap.
     *
     * @param id The ID of the beatmap.
     * @param maxCombo The maximum combo of the beatmap.
     * @returns Whether the update was successful.
     */
    updateMaxCombo(id: number, maxCombo: number): Promise<boolean>;
}
