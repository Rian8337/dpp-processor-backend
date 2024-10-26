import { OsuAPIResponse } from "@rian8337/osu-base";

const host = "http://localhost:3017/api/beatmap/";

/**
 * Obtains a beatmap from the beatmap processor.
 *
 * @param idOrHash The ID or MD5 hash of the beatmap.
 * @returns The beatmap in osu! API response format, `null` if the beatmap cannot be obtained.
 */
export function getBeatmap(
    idOrHash: number | string,
): Promise<OsuAPIResponse | null> {
    const url = new URL(`${host}/getbeatmap`);

    url.searchParams.append("key", process.env.DROID_SERVER_INTERNAL_KEY!);

    if (typeof idOrHash === "number") {
        url.searchParams.append("id", idOrHash.toString());
    } else {
        url.searchParams.append("hash", idOrHash);
    }

    return fetch(url)
        .then((res) => {
            if (!res.ok) {
                return null;
            }

            return res.json() as Promise<OsuAPIResponse>;
        })
        .catch((e: unknown) => {
            console.error("Failed to fetch beatmap:", e);

            return null;
        });
}

/**
 * Obtains the beatmap file of a beatmap.
 *
 * @param idOrHash The ID or MD5 hash of the beatmap.
 * @returns The beatmap file, `null` if the beatmap file cannot be downloaded.
 */
export function getBeatmapFile(
    idOrHash: number | string,
): Promise<string | null> {
    const url = new URL(`${host}/getbeatmapfile`);

    url.searchParams.append("key", process.env.DROID_SERVER_INTERNAL_KEY!);

    if (typeof idOrHash === "number") {
        url.searchParams.append("id", idOrHash.toString());
    } else {
        url.searchParams.append("hash", idOrHash);
    }

    return fetch(url)
        .then((res) => {
            if (!res.ok) {
                return null;
            }

            return res.text();
        })
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });
}
