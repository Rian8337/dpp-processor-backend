import { MapInfo } from "@rian8337/osu-base";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { processorDb } from "../../";
import { beatmapTable } from "../../schema";

(async () => {
    // Select beatmaps with empty hash
    const emptyBeatmaps = await processorDb
        .select()
        .from(beatmapTable)
        .where(eq(beatmapTable.hash, ""));

    // Update beatmaps with empty hash
    for (const emptyBeatmap of emptyBeatmaps) {
        const apiBeatmap = await MapInfo.getInformation(emptyBeatmap.id, false);

        if (!apiBeatmap) {
            console.log(
                `Cannot find beatmap with ID ${emptyBeatmap.id.toString()} from osu! API`,
            );

            // Cannot find beatmap from API; delete from database
            await processorDb
                .delete(beatmapTable)
                .where(eq(beatmapTable.id, emptyBeatmap.id));

            continue;
        }

        // Update beatmap information in the database
        await processorDb
            .update(beatmapTable)
            .set({
                hash: apiBeatmap.hash,
                title: apiBeatmap.fullTitle,
                hitLength: apiBeatmap.hitLength,
                totalLength: apiBeatmap.totalLength,
                maxCombo: apiBeatmap.maxCombo,
                objectCount: apiBeatmap.objects,
                rankedStatus: apiBeatmap.approved,
                lastChecked: new Date(),
            })
            .where(eq(beatmapTable.id, emptyBeatmap.id));

        console.log(`Updated beatmap with ID ${emptyBeatmap.id.toString()}`);
    }

    console.log("Finished updating beatmaps with empty hash");

    process.exit(0);
})().catch((e: unknown) => {
    console.error(e);
});
