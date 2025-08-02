import { OsuAPIResponse } from "@rian8337/osu-base";

/**
 * Provides operations for interacting with beatmap APIs.
 */
export interface IBeatmapAPIProvider {
    /**
     * Obtains a beatmap from the beatmap API.
     *
     * @param idOrHash The ID or MD5 hash of the beatmap.
     * @returns The beatmap data.
     */
    getBeatmap(idOrHash: string | number): Promise<OsuAPIResponse>;

    /**
     * Obtains the file of a beatmap from the beatmap API.
     *
     * @param idOrHash The ID or MD5 hash of the beatmap.
     * @returns The beatmap file as a Buffer.
     */
    getBeatmapFile(idOrHash: string | number): Promise<Buffer>;
}
