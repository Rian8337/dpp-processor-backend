/**
 * The beatmap fields the processor uses.
 */
export interface BeatmapMetadata {
    readonly id: number;

    /**
     * MD5 hash of the `.osu` file.
     */
    readonly hash: string;
}

/**
 * HTTP client for the beatmap service (`~/Projects/osu-beatmap-processor`).
 *
 * Methods throw `ServiceUnavailableError` (`BEATMAP_SERVICE_UNAVAILABLE`) when the service fails or times out.
 */
export interface IBeatmapServiceClient {
    /**
     * @returns The beatmap's metadata, or `null` if the beatmap does not exist.
     */
    getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null>;

    /**
     * @returns The `.osu` file's bytes, or `null` if it does not exist.
     */
    getBeatmapFile(id: number): Promise<Buffer | null>;
}
