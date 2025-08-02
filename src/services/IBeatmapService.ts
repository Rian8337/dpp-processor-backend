import { IBeatmap } from "@/database/processor/schema";
import { EitherOperationResult } from "@/types";

/**
 * Provides beatmap-related operations.
 */
export interface IBeatmapService {
    /**
     * Obtains a beatmap.
     *
     * @param idOrHash The ID or MD5 hash of the beatmap.
     * @returns The beatmap.
     */
    getBeatmap(
        idOrHash: number | string,
    ): Promise<EitherOperationResult<IBeatmap>>;

    /**
     * Updates the maximum combo of a beatmap.
     *
     * This is used in place of the osu! API for setting the maximum combo of a beatmap
     * in case the API returns `null`.
     *
     * @param id The ID of the beatmap.
     * @param maxCombo The maximum combo of the beatmap.
     * @returns Whether the update was successful.
     */
    updateBeatmapMaxCombo(id: number, maxCombo: number): Promise<boolean>;
}
