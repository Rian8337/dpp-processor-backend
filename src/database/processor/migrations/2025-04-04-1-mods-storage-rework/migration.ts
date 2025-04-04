import {
    DroidLegacyModConverter,
    ModCustomSpeed,
    ModDifficultyAdjust,
    ModMap,
    ModUtil,
} from "@rian8337/osu-base";
import "dotenv/config";
import { processorPool } from "../..";

void (async () => {
    const tables = [
        "live_droid_difficulty_attributes",
        "rebalance_droid_difficulty_attributes",
        "live_osu_difficulty_attributes",
        "rebalance_osu_difficulty_attributes",
    ] as const;

    for (const table of tables) {
        const entries = await processorPool
            .query<{
                readonly beatmap_id: number;
                readonly mods: string;
                readonly speed_multiplier: number;
                readonly force_cs: number;
                readonly force_ar: number;
                readonly force_od: number;
                readonly old_statistics: string;
            }>(
                `SELECT beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics FROM ${table};`,
            )
            .then((res) => res.rows);

        for (const entry of entries) {
            let newMods: ModMap;

            switch (table) {
                case "live_droid_difficulty_attributes":
                case "rebalance_droid_difficulty_attributes":
                    newMods =
                        entry.mods === "-"
                            ? new ModMap()
                            : DroidLegacyModConverter.convert(entry.mods);
                    break;

                case "live_osu_difficulty_attributes":
                case "rebalance_osu_difficulty_attributes":
                    newMods = ModUtil.pcStringToMods(entry.mods);
                    break;
            }

            if (entry.speed_multiplier !== 1) {
                newMods.set(new ModCustomSpeed(entry.speed_multiplier));
            }

            if (
                entry.force_cs !== -1 ||
                entry.force_ar !== -1 ||
                entry.force_od !== -1
            ) {
                newMods.set(
                    new ModDifficultyAdjust({
                        cs: entry.force_cs !== -1 ? entry.force_cs : undefined,
                        ar: entry.force_ar !== -1 ? entry.force_ar : undefined,
                        od: entry.force_od !== -1 ? entry.force_od : undefined,
                    }),
                );
            }

            await processorPool.query(
                `UPDATE ${table} SET mods = $1 WHERE beatmap_id = $2 AND mods = $3 AND speed_multiplier = $4 AND force_cs = $5 AND force_ar = $6 AND force_od = $7 AND old_statistics = $8;`,
                [
                    JSON.stringify(newMods.serializeMods()),
                    entry.beatmap_id,
                    entry.mods,
                    entry.speed_multiplier,
                    entry.force_cs,
                    entry.force_ar,
                    entry.force_od,
                    entry.old_statistics,
                ],
            );
        }

        const client = await processorPool.connect();

        try {
            const primaryKey = `${table}_pkey`;

            await client.query("BEGIN");

            // Drop current primary key
            await client.query(
                `ALTER TABLE ${table} DROP CONSTRAINT ${primaryKey};`,
            );

            // Drop speed multiplier, force_cs, force_ar, force_od, and old_statistics columns
            await client.query(
                `ALTER TABLE ${table} DROP COLUMN speed_multiplier, DROP COLUMN force_cs, DROP COLUMN force_ar, DROP COLUMN force_od, DROP COLUMN old_statistics;`,
            );

            // Convert mods column from text to jsonb
            await client.query(
                `ALTER TABLE ${table} ALTER COLUMN mods TYPE jsonb USING mods::jsonb;`,
            );

            // Add new primary key
            await client.query(
                `ALTER TABLE ${table} ADD CONSTRAINT ${primaryKey} PRIMARY KEY (beatmap_id, mods);`,
            );

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }

        console.log(`Finished processing ${table} table`);
    }

    console.log("Finished processing all tables");

    process.exit(0);
})();
