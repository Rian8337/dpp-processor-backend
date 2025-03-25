import { Collection } from "@discordjs/collection";
import { MapInfo, RankedStatus } from "@rian8337/osu-base";
import { eq } from "drizzle-orm";
import { processorDb } from "../../database/processor";
import { beatmapTable } from "../../database/processor/schema";
import { ProcessorDatabaseBeatmap } from "../../database/processor/schema/ProcessorDatabaseBeatmap";
import * as beatmapService from "../../services/beatmapService";
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
    beatmapIdOrHash: number | string,
): Promise<typeof beatmapTable.$inferSelect | null> {
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
        (cache.rankedStatus as RankedStatus) !== RankedStatus.ranked &&
        (cache.rankedStatus as RankedStatus) !== RankedStatus.approved &&
        cache.lastChecked < new Date(Date.now() - 1800000)
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
            cache.lastChecked = new Date();

            if (beatmap.approved !== (cache.rankedStatus as RankedStatus)) {
                cache.rankedStatus = beatmap.approved;

                await processorDb
                    .update(beatmapTable)
                    .set({
                        lastChecked: cache.lastChecked,
                        rankedStatus: cache.rankedStatus,
                    })
                    .where(eq(beatmapTable.id, cache.id));
            } else {
                await processorDb
                    .update(beatmapTable)
                    .set({ lastChecked: cache.lastChecked })
                    .where(eq(beatmapTable.id, cache.id));
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
        cache.maxCombo = maxCombo;
    }

    return processorDb
        .update(beatmapTable)
        .set({ maxCombo })
        .where(eq(beatmapTable.id, id))
        .then(() => true)
        .catch((e: unknown) => {
            console.error("Error when updating beatmap maximum combo:", e);

            return false;
        });
}

function getBeatmapFromDatabase(
    beatmapIdOrHash: number | string,
): Promise<ProcessorDatabaseBeatmap | null> {
    return processorDb
        .select()
        .from(beatmapTable)
        .where(
            eq(
                typeof beatmapIdOrHash === "number"
                    ? beatmapTable.id
                    : beatmapTable.hash,
                beatmapIdOrHash,
            ),
        )
        .then((res) => res.at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Error when getting beatmap from database:", e);

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
    await processorDb
        .delete(beatmapTable)
        .where(eq(beatmapTable.id, newCache.id));
}

async function insertNewCache(cache: ProcessorDatabaseBeatmap) {
    databaseBeatmapIdCache.set(cache.id, cache);
    databaseBeatmapHashCache.set(cache.hash, cache);

    // Insert the cache to the database.
    await processorDb.insert(beatmapTable).values(cache);
}

function beatmapToCache(beatmap: MapInfo): ProcessorDatabaseBeatmap {
    return {
        id: beatmap.beatmapId,
        hash: beatmap.hash,
        title: beatmap.fullTitle,
        hitLength: beatmap.hitLength,
        totalLength: beatmap.totalLength,
        maxCombo: beatmap.maxCombo,
        objectCount: beatmap.objects,
        rankedStatus: beatmap.approved,
        lastChecked: new Date(),
    };
}
