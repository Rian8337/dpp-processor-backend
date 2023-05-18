import { MapInfo } from "@rian8337/osu-base";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";

/**
 * Options for beatmap retrieval.
 */
export interface BeatmapRetrievalOptions<TCheckFile extends boolean> {
    /**
     * Whether to check if the beatmap's `.osu` file is downloaded, and downloads it if it's not. Defaults to `true`.
     */
    checkFile?: TCheckFile;

    /**
     * Whether to skip the cache check and request the osu! API. Defaults to `false`.
     */
    forceCheck?: boolean;

    /**
     * Whether to cache the beatmap after retrieval. Defaults to `true`.
     */
    cacheBeatmap?: boolean;
}

/**
 * Gets a beatmap from the beatmap cache, or downloads it if it's not available.
 *
 * @param beatmapIdOrHash The beatmap ID or MD5 hash of the beatmap.
 * @param options Options for the retrieval of the beatmap.
 * @returns A `MapInfo` instance representing the beatmap.
 */
export async function getBeatmap<TCheckFile extends boolean = true>(
    beatmapIdOrHash: number | string,
    options?: BeatmapRetrievalOptions<TCheckFile>
): Promise<MapInfo<TCheckFile> | null> {
    const oldCache = beatmapCache.find(
        (v) => v.beatmapID === beatmapIdOrHash || v.hash === beatmapIdOrHash
    );

    if (oldCache && !options?.forceCheck) {
        if (options?.checkFile !== false) {
            await oldCache.retrieveBeatmapFile();
        }

        return oldCache;
    }

    const newCache = await MapInfo.getInformation(
        beatmapIdOrHash,
        options?.checkFile
    );

    if (!newCache) {
        return null;
    }

    if (options?.cacheBeatmap !== false) {
        beatmapCache.set(newCache.beatmapID, newCache);
    }

    return <MapInfo>newCache;
}

/**
 * The beatmaps that have been cached, mapped by beatmap ID.
 */
const beatmapCache = new LimitedCapacityCollection<number, MapInfo>(150, 600);
