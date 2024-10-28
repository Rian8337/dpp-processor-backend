import { MapInfo, RankedStatus } from "@rian8337/osu-base";
import { ProcessorDatabaseBeatmap } from "../../database/processor/schema/ProcessorDatabaseBeatmap";
import { processorPool } from "../../database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseTables } from "../../database/processor/ProcessorDatabaseTables";
import { invalidateDifficultyAttributesCache } from "./difficultyAttributesStorage";
import * as beatmapService from "../../services/beatmapService";
import { Collection } from "@discordjs/collection";

/**
 * The database beatmap cache, mapped by beatmap ID.
 */
const databaseBeatmapIdCache = new Collection<
    number,
    ProcessorDatabaseBeatmap
>();

/**
 * The database beatmap cache, mapped by beatmap hash.
 */
const databaseBeatmapHashCache = new Collection<
    string,
    ProcessorDatabaseBeatmap
>();

/**
 * Gets a beatmap from the beatmap cache, or requests the osu! API it if it's not available.
 *
 * @param beatmapIdOrHash The beatmap ID or MD5 hash of the beatmap.
 * @param options Options for the retrieval of the beatmap.
 * @returns A `MapInfo` instance representing the beatmap.
 */
export async function getBeatmap(
    beatmapIdOrHash: number | string,
): Promise<ProcessorDatabaseBeatmap | null> {
    // Check existing cache first.
    let cache =
        (typeof beatmapIdOrHash === "number"
            ? databaseBeatmapIdCache.get(beatmapIdOrHash)
            : databaseBeatmapHashCache.get(beatmapIdOrHash)) ?? null;

    // If not found, get the beatmap from the database.
    cache ??= await getBeatmapFromDatabase(beatmapIdOrHash);

    // If still not found, fetch from beatmap processor.
    if (!cache) {
        const apiBeatmap = await beatmapService.getBeatmap(beatmapIdOrHash);

        if (!apiBeatmap) {
            return null;
        }

        const beatmap = MapInfo.from(apiBeatmap);

        cache = beatmapToCache(beatmap);

        // When retrieving with beatmap hash, the beatmap may be invalid when the new hash is retrieved.
        // In that case, invalidate the cache.
        if (typeof beatmapIdOrHash === "string") {
            if (databaseBeatmapIdCache.has(cache.id)) {
                await invalidateBeatmapCache(beatmapIdOrHash, cache);
            } else {
                // Check if the old beatmap cache is in the database.
                const oldCache = await getBeatmapFromDatabase(cache.id);

                if (oldCache && oldCache.hash !== beatmap.hash) {
                    await invalidateBeatmapCache(beatmapIdOrHash, cache);
                }
            }
        }

        await insertNewCache(cache);
    }

    // For unranked beatmaps, check the status if 30 minutes have passed since the last check.
    if (
        cache.ranked_status !== RankedStatus.ranked &&
        cache.ranked_status !== RankedStatus.approved &&
        cache.last_checked < new Date(Date.now() - 1800000)
    ) {
        const apiBeatmap = await beatmapService.getBeatmap(beatmapIdOrHash);

        if (!apiBeatmap) {
            // Cannot check status - invalidate for now, but do not delete existing cache.
            return null;
        }

        const beatmap = MapInfo.from(apiBeatmap);

        if (cache.hash !== beatmap.hash) {
            // Beatmap has been updated - invalidate cache completely.
            const oldHash = cache.hash;

            cache = beatmapToCache(beatmap);

            await invalidateBeatmapCache(oldHash, cache);
            await insertNewCache(cache);
        } else {
            // Update the last checked date.
            cache.last_checked = new Date();

            if (beatmap.approved !== cache.ranked_status) {
                cache.ranked_status = beatmap.approved;

                await processorPool.query<ProcessorDatabaseBeatmap>(
                    `UPDATE ${ProcessorDatabaseTables.beatmap} SET last_checked = $1, ranked_status = $2 WHERE id = $3;`,
                    [cache.last_checked, cache.ranked_status, cache.id],
                );
            } else {
                await processorPool.query<ProcessorDatabaseBeatmap>(
                    `UPDATE ${ProcessorDatabaseTables.beatmap} SET last_checked = $1 WHERE id = $2;`,
                    [cache.last_checked, cache.id],
                );
            }
        }
    }

    // Cache the beatmap in memory.
    databaseBeatmapIdCache.set(cache.id, cache);
    databaseBeatmapHashCache.set(cache.hash, cache);

    return cache;
}

/**
 * Updates the maximum combo of a beatmap.
 *
 * This is used in place of the osu! API for setting the maximum combo
 * of a beatmap in case the API returns `null`.
 *
 * @param id The ID of the beatmap.
 * @param maxCombo The maximum combo of the beatmap.
 * @returns Whether the update was successful.
 */
export async function updateBeatmapMaxCombo(
    id: number,
    maxCombo: number,
): Promise<boolean> {
    const cache = databaseBeatmapIdCache.get(id);

    if (cache) {
        cache.max_combo = maxCombo;
    }

    return processorPool
        .query(
            `UPDATE ${ProcessorDatabaseTables.beatmap} SET max_combo = $1 WHERE id = $2;`,
            [maxCombo, id],
        )
        .then(() => true)
        .catch((e: unknown) => {
            console.error("Error when updating beatmap maximum combo:", e);

            return false;
        });
}

function getBeatmapFromDatabase(
    beatmapIdOrHash: number | string,
): Promise<ProcessorDatabaseBeatmap | null> {
    return processorPool
        .query<ProcessorDatabaseBeatmap>(
            `SELECT * FROM ${ProcessorDatabaseTables.beatmap} WHERE ${
                typeof beatmapIdOrHash === "number" ? "id" : "hash"
            } = $1;`,
            [beatmapIdOrHash],
        )
        .then((res) => res.rows.at(0) ?? null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });
}

async function invalidateBeatmapCache(
    oldHash: string,
    newCache: ProcessorDatabaseBeatmap,
) {
    invalidateDifficultyAttributesCache(newCache.id);

    databaseBeatmapIdCache.delete(newCache.id);
    databaseBeatmapHashCache.delete(oldHash);

    // Delete the cache from the database. This will force all difficulty attributes to be dropped as well.
    await processorPool.query<ProcessorDatabaseBeatmap>(
        `DELETE FROM ${ProcessorDatabaseTables.beatmap} WHERE id = $1;`,
        [newCache.id],
    );
}

async function insertNewCache(cache: ProcessorDatabaseBeatmap) {
    databaseBeatmapIdCache.set(cache.id, cache);
    databaseBeatmapHashCache.set(cache.hash, cache);

    // Insert the cache to the database.
    await processorPool.query<ProcessorDatabaseBeatmap>(
        `INSERT INTO ${ProcessorDatabaseTables.beatmap} (id, hash, title, hit_length, total_length, max_combo, object_count, ranked_status, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
            cache.id,
            cache.hash,
            cache.title,
            cache.hit_length,
            cache.total_length,
            cache.max_combo,
            cache.object_count,
            cache.ranked_status,
            cache.last_checked,
        ],
    );
}

function beatmapToCache(beatmap: MapInfo): ProcessorDatabaseBeatmap {
    return {
        id: beatmap.beatmapId,
        hash: beatmap.hash,
        title: beatmap.fullTitle,
        hit_length: beatmap.hitLength,
        total_length: beatmap.totalLength,
        max_combo: beatmap.maxCombo,
        object_count: beatmap.objects,
        ranked_status: beatmap.approved,
        last_checked: new Date(),
    };
}
