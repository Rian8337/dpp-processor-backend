import { config } from "dotenv";
import { processorPool } from "../../ProcessorDatabasePool";
import { ProcessorDatabaseBeatmap } from "../../schema/ProcessorDatabaseBeatmap";
import { ProcessorDatabaseTables } from "../../ProcessorDatabaseTables";
import { MapInfo } from "@rian8337/osu-base";

config();

processorPool.connect().then(async () => {
    // Select beatmaps with empty hash
    const emptyBeatmapQuery =
        await processorPool.query<ProcessorDatabaseBeatmap>(
            `SELECT * FROM ${ProcessorDatabaseTables.beatmap} WHERE hash = '';`
        );

    // Update beatmaps with empty hash
    for (const beatmap of emptyBeatmapQuery.rows) {
        const apiBeatmap = await MapInfo.getInformation(beatmap.id, false);

        if (!apiBeatmap) {
            console.log(
                `Cannot find beatmap with ID ${beatmap.id} from osu! API`
            );

            // Cannot find beatmap from API; delete from database
            await processorPool.query(
                `DELETE FROM ${ProcessorDatabaseTables.beatmap} WHERE id = $1;`,
                [beatmap.id]
            );

            continue;
        }

        // Update beatmap information in the database
        await processorPool.query(
            `UPDATE ${ProcessorDatabaseTables.beatmap} SET hash = $1, title = $2, hit_length = $3, total_length = $4, max_combo = $5, object_count = $6, ranked_status = $7, last_checked = $8 WHERE id = $9;`,
            [
                apiBeatmap.hash,
                apiBeatmap.fullTitle,
                apiBeatmap.hitLength,
                apiBeatmap.totalLength,
                apiBeatmap.maxCombo,
                apiBeatmap.objects,
                apiBeatmap.approved,
                new Date(),
                beatmap.id,
            ]
        );

        console.log(`Updated beatmap with ID ${beatmap.id}`);
    }

    console.log("Finished updating beatmaps with empty hash");

    process.exit(0);
});
