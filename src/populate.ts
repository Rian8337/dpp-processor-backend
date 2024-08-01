import { config } from "dotenv";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseBeatmapCachePopulation } from "./database/processor/schema/ProcessorDatabaseBeatmapCachePopulation";
import { ProcessorDatabaseBeatmap } from "./database/processor/schema/ProcessorDatabaseBeatmap";
import { MapInfo, RankedStatus, Utils } from "@rian8337/osu-base";
import { getBeatmapFile } from "./utils/cache/beatmapStorage";

config();

(async () => {
    let id = await processorPool
        .query<ProcessorDatabaseBeatmapCachePopulation>(
            `SELECT id FROM ${ProcessorDatabaseTables.beatmapCachePopulation};`,
        )
        .then((res) => res.rows.at(0)?.id ?? null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });

    if (id === null) {
        id = 75;

        await processorPool.query(
            `INSERT INTO ${ProcessorDatabaseTables.beatmapCachePopulation} (id) VALUES ($1);`,
            [id],
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
        // Update progress.
        await processorPool.query(
            `UPDATE ${ProcessorDatabaseTables.beatmapCachePopulation} SET id = $1;`,
            [id],
        );

        // Check if the beatmap is already cached.
        const beatmap = await processorPool
            .query<Pick<ProcessorDatabaseBeatmap, "hash">>(
                `SELECT hash FROM ${ProcessorDatabaseTables.beatmap} WHERE id = $1;`,
                [id],
            )
            .then((res) => res.rows.at(0) ?? null)
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        if (beatmap) {
            // Beatmap is already cached - skip.
            console.log("Beatmap", id, "is already cached");
            ++id;
            continue;
        }

        // Request to osu! API.
        const apiBeatmap = await MapInfo.getInformation(id, false);

        await Utils.sleep(0.1);

        if (!apiBeatmap) {
            // Beatmap not found.
            console.log("Beatmap", id, "not found");
            ++id;
            continue;
        }

        if (
            apiBeatmap.approved !== RankedStatus.ranked &&
            apiBeatmap.approved !== RankedStatus.approved
        ) {
            // Beatmap is not ranked or approved - skip.
            console.log("Beatmap", id, "is not ranked or approved");
            ++id;
            continue;
        }

        // Download beatmap file and insert cache.
        await getBeatmapFile(id);

        await Utils.sleep(0.2);

        // Insert the cache to the database.
        await processorPool.query(
            `INSERT INTO ${ProcessorDatabaseTables.beatmap} (id, hash, title, hit_length, total_length, max_combo, object_count, ranked_status, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
            [
                id,
                apiBeatmap.hash,
                apiBeatmap.hash,
                apiBeatmap.fullTitle,
                apiBeatmap.hitLength,
                apiBeatmap.totalLength,
                apiBeatmap.maxCombo,
                apiBeatmap.objects,
                apiBeatmap.approved,
                new Date(),
            ],
        );

        console.log("Cached beatmap", id++);
    }
})()
    .then(() => {
        console.log("Done");
    })
    .catch((e: unknown) => {
        console.error(e);
    })
    .finally(() => processorPool.end());
