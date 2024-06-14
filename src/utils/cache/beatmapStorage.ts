import { MapInfo, RankedStatus } from "@rian8337/osu-base";
import { readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { Collection } from "@discordjs/collection";
import { ProcessorDatabaseBeatmap } from "../../database/processor/schema/ProcessorDatabaseBeatmap";
import { processorPool } from "../../database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseTables } from "../../database/processor/ProcessorDatabaseTables";
import { invalidateDifficultyAttributesCache } from "./difficultyAttributesStorage";

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
    beatmapIdOrHash: number | string
): Promise<ProcessorDatabaseBeatmap | null> {
    // Check existing cache first.
    let cache =
        (typeof beatmapIdOrHash === "number"
            ? databaseBeatmapIdCache.get(beatmapIdOrHash)
            : databaseBeatmapHashCache.get(beatmapIdOrHash)) ?? null;

    // If not found, get the beatmap from the database.
    cache ??= await getBeatmapFromDatabase(beatmapIdOrHash);

    // If still not found, request from osu! API.
    if (!cache) {
        const apiBeatmap = await MapInfo.getInformation(beatmapIdOrHash, false);

        if (!apiBeatmap) {
            return null;
        }

        cache = {
            id: apiBeatmap.beatmapId,
            hash: apiBeatmap.hash,
            title: apiBeatmap.fullTitle,
            hit_length: apiBeatmap.hitLength,
            total_length: apiBeatmap.totalLength,
            max_combo: apiBeatmap.maxCombo,
            object_count: apiBeatmap.objects,
            ranked_status: apiBeatmap.approved,
            last_checked: new Date(),
        };

        // When retrieving with beatmap hash, the beatmap may be invalid when the new hash is retrieved.
        // In that case, invalidate the cache.
        if (typeof beatmapIdOrHash === "string") {
            if (databaseBeatmapIdCache.has(cache.id)) {
                await invalidateBeatmapCache(beatmapIdOrHash, cache);
            } else {
                // Check if the old beatmap cache is in the database.
                const oldCache = await getBeatmapFromDatabase(cache.id);

                if (oldCache && oldCache.hash !== apiBeatmap.hash) {
                    await invalidateBeatmapCache(beatmapIdOrHash, cache);
                }
            }
        }

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
            ]
        );
    }

    // For unranked beatmaps, check the status if 30 minutes have passed since the last check.
    if (
        cache.ranked_status !== RankedStatus.ranked &&
        cache.ranked_status !== RankedStatus.approved &&
        cache.last_checked < new Date(Date.now() - 1800000)
    ) {
        const apiBeatmap = await MapInfo.getInformation(cache.id, false);

        if (!apiBeatmap) {
            // Cannot check status - invalidate for now, but do not delete existing cache.
            return null;
        }

        if (cache.hash !== apiBeatmap.hash) {
            // Beatmap has been updated - invalidate cache completely.
            const oldHash = cache.hash;

            cache = {
                id: apiBeatmap.beatmapId,
                hash: apiBeatmap.hash,
                title: apiBeatmap.fullTitle,
                hit_length: apiBeatmap.hitLength,
                total_length: apiBeatmap.totalLength,
                max_combo: apiBeatmap.maxCombo,
                object_count: apiBeatmap.objects,
                ranked_status: apiBeatmap.approved,
                last_checked: new Date(),
            };

            await invalidateBeatmapCache(oldHash, cache);
        } else {
            // Update the last checked date.
            cache.last_checked = new Date();

            if (apiBeatmap.approved !== cache.ranked_status) {
                cache.ranked_status = apiBeatmap.approved;

                await processorPool.query<ProcessorDatabaseBeatmap>(
                    `UPDATE ${ProcessorDatabaseTables.beatmap} SET last_checked = $1, ranked_status = $2 WHERE id = $3;`,
                    [cache.last_checked, cache.ranked_status, cache.id]
                );
            } else {
                await processorPool.query<ProcessorDatabaseBeatmap>(
                    `UPDATE ${ProcessorDatabaseTables.beatmap} SET last_checked = $1 WHERE id = $2;`,
                    [cache.last_checked, cache.id]
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
 * Gets the beatmap file of a beatmap.
 *
 * @param id The ID of the beatmap.
 * @returns The beatmap file, `null` if the beatmap file cannot be downloaded.
 */
export async function getBeatmapFile(id: number): Promise<string | null> {
    // Check existing file first.
    let beatmapFile = await readFile(
        join("beatmaps", `${id}.osu`),
        "utf-8"
    ).catch(() => null);

    if (beatmapFile) {
        return beatmapFile;
    }

    // If there is not, request from osu! API.
    beatmapFile = await fetch(`https://osu.ppy.sh/osu/${id}`)
        .then((res) => {
            if (!res.ok) {
                return null;
            }

            return res.text();
        })
        .catch(() => null);

    if (!beatmapFile) {
        return null;
    }

    // Cache the beatmap file.
    await writeFile(join("beatmaps", `${id}.osu`), beatmapFile);

    return beatmapFile;
}

function getBeatmapFromDatabase(
    beatmapIdOrHash: number | string
): Promise<ProcessorDatabaseBeatmap | null> {
    return processorPool
        .query<ProcessorDatabaseBeatmap>(
            `SELECT * FROM ${ProcessorDatabaseTables.beatmap} WHERE ${
                typeof beatmapIdOrHash === "number" ? "id" : "hash"
            } = $1;`,
            [beatmapIdOrHash]
        )
        .then((res) => res.rows.at(0) ?? null)
        .catch((e) => {
            console.error(e);

            return null;
        });
}

async function invalidateBeatmapCache(
    oldHash: string,
    newCache: ProcessorDatabaseBeatmap
) {
    invalidateDifficultyAttributesCache(newCache.id);

    databaseBeatmapIdCache.delete(newCache.id);
    databaseBeatmapHashCache.delete(oldHash);

    // Delete the beatmap file.
    await unlink(join("beatmaps", `${newCache.id}.osu`)).catch(() => null);

    // Delete the cache from the database. This will force all difficulty attributes to be dropped as well.
    await processorPool.query<ProcessorDatabaseBeatmap>(
        `DELETE FROM ${ProcessorDatabaseTables.beatmap} WHERE id = $1;`,
        [newCache.id]
    );

    // Insert the new cache.
    await processorPool.query<ProcessorDatabaseBeatmap>(
        `INSERT INTO ${ProcessorDatabaseTables.beatmap} (id, hash, title, hit_length, total_length, max_combo, object_count, ranked_status, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
            newCache.id,
            newCache.hash,
            newCache.title,
            newCache.hit_length,
            newCache.total_length,
            newCache.max_combo,
            newCache.object_count,
            newCache.ranked_status,
            newCache.last_checked,
        ]
    );
}
