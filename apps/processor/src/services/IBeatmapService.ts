import type { BeatmapReference } from "@dpp/shared";

/**
 * A beatmap ready for calculation.
 */
export interface ResolvedBeatmap {
    /**
     * MD5 hash of the `.osu` file.
     */
    readonly hash: string;

    /**
     * Whether attributes for this beatmap may be stored. False for uploaded files.
     */
    readonly cacheable: boolean;

    /**
     * Gets the `.osu` file, downloading it on first use.
     */
    getFile(): Promise<string>;
}

/**
 * Resolves beatmap references through the beatmap service.
 */
export interface IBeatmapService {
    /**
     * @throws {NotFoundError} `BEATMAP_NOT_FOUND` if the beatmap does not exist.
     * @throws {ServiceUnavailableError} `BEATMAP_SERVICE_UNAVAILABLE` if the beatmap service fails, or the file
     * changed while it was being fetched.
     */
    resolve(reference: BeatmapReference): Promise<ResolvedBeatmap>;
}
