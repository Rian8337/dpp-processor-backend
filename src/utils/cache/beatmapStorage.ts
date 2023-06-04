import { MapInfo } from "@rian8337/osu-base";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";

/**
 * Options for beatmap retrieval.
 */
export interface BeatmapRetrievalOptions {
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
export async function getBeatmap(
    beatmapIdOrHash: number | string,
    options?: BeatmapRetrievalOptions
): Promise<MapInfo<false> | null> {
    const oldCache = beatmapAPICache.find(
        (v) => v.beatmapID === beatmapIdOrHash || v.hash === beatmapIdOrHash
    );

    if (oldCache && !options?.forceCheck) {
        return oldCache;
    }

    const newCache = await MapInfo.getInformation(beatmapIdOrHash, false);

    if (!newCache) {
        return null;
    }

    if (options?.cacheBeatmap !== false) {
        beatmapAPICache.set(newCache.beatmapID, newCache);
    }

    return newCache;
}

/**
 * Gets the beatmap file of a beatmap.
 *
 * @param beatmap The beatmap.
 * @returns The beatmap file, `null` if the beatmap file cannot be downloaded.
 */
export async function getBeatmapFile(beatmap: MapInfo): Promise<string | null> {
    const oldCache = beatmapFileCache.get(beatmap.hash);

    if (oldCache) {
        return oldCache;
    }

    const url = new URL(`https://osu.ppy.sh/osu/${beatmap.beatmapID}`);
    const newCache = await fetch(url)
        .then((res) => {
            if (!res.ok) {
                return null;
            }

            return res.text();
        })
        .catch(() => null);

    if (newCache) {
        beatmapFileCache.set(beatmap.hash, newCache);
    }

    return newCache;
}

/**
 * The beatmap API responses cache, mapped by beatmap ID.
 */
const beatmapAPICache = new LimitedCapacityCollection<number, MapInfo>(
    500,
    1800
);

/**
 * The beatmap file cache, mapped by beatmap hash.
 */
const beatmapFileCache = new LimitedCapacityCollection<string, string>(
    500,
    1800
);
