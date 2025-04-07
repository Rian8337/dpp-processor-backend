import {
    DroidLegacyModConverter,
    ModCustomSpeed,
    ModDifficultyAdjust,
    ModMap,
    ModUtil,
} from "@rian8337/osu-base";
import "dotenv/config";
import { processorPool } from "../..";
import {
    DifficultSlider,
    HighStrainSection,
} from "@rian8337/osu-difficulty-calculator";

void (async () => {
    const tables = [
        "live_droid_difficulty_attributes",
        "rebalance_droid_difficulty_attributes",
        "live_osu_difficulty_attributes",
        "rebalance_osu_difficulty_attributes",
    ] as const;

    for (const table of tables) {
        switch (table) {
            case "live_droid_difficulty_attributes":
            case "rebalance_droid_difficulty_attributes": {
                const entries = await processorPool
                    .query<{
                        readonly beatmap_id: number;
                        readonly mods: string;
                        readonly speed_multiplier: number;
                        readonly force_cs: number;
                        readonly force_ar: number;
                        readonly force_od: number;
                        readonly old_statistics: boolean;
                        readonly possible_three_fingered_sections: string;
                        readonly difficult_sliders: string;
                    }>(
                        `SELECT beatmap_id, mods, speed_multiplier, force_cs, force_ar, force_od, old_statistics, possible_three_fingered_sections, difficult_sliders FROM ${table};`,
                    )
                    .then((res) => res.rows);

                for (const entry of entries) {
                    const newMods =
                        entry.mods === "-"
                            ? new ModMap()
                            : DroidLegacyModConverter.convert(entry.mods);

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
                                cs:
                                    entry.force_cs !== -1
                                        ? entry.force_cs
                                        : undefined,
                                ar:
                                    entry.force_ar !== -1
                                        ? entry.force_ar
                                        : undefined,
                                od:
                                    entry.force_od !== -1
                                        ? entry.force_od
                                        : undefined,
                            }),
                        );
                    }

                    const newDifficultSliders = ((): DifficultSlider[] => {
                        const sliders = entry.difficult_sliders.split(" ");

                        if (!sliders[0]) {
                            // First element is an empty string; no difficult sliders.
                            return [];
                        }

                        const result: DifficultSlider[] = [];

                        for (let i = 0; i < sliders.length; i += 2) {
                            result.push({
                                index: parseInt(sliders[i]),
                                difficultyRating: parseFloat(sliders[i + 1]),
                            });
                        }

                        return result;
                    })();

                    const newPossibleThreeFingeredSections =
                        ((): HighStrainSection[] => {
                            const sections =
                                entry.possible_three_fingered_sections.split(
                                    " ",
                                );

                            if (!sections[0]) {
                                // First element is an empty string; no possible three-fingered sections.
                                return [];
                            }

                            const result: HighStrainSection[] = [];

                            for (let i = 0; i < sections.length; i += 3) {
                                result.push({
                                    firstObjectIndex: parseInt(sections[i]),
                                    lastObjectIndex: parseInt(sections[i + 1]),
                                    sumStrain: parseFloat(sections[i + 2]),
                                });
                            }

                            return result;
                        })();

                    await processorPool.query(
                        `UPDATE ${table} SET mods = $1, possible_three_fingered_sections = $2, difficult_sliders = $3 WHERE beatmap_id = $4 AND mods = $5 AND speed_multiplier = $6 AND force_cs = $7 AND force_ar = $8 AND force_od = $9 AND old_statistics = $10;`,
                        [
                            JSON.stringify(newMods.serializeMods()),
                            JSON.stringify(newPossibleThreeFingeredSections),
                            JSON.stringify(newDifficultSliders),
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

                break;
            }

            case "live_osu_difficulty_attributes":
            case "rebalance_osu_difficulty_attributes": {
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
                    const newMods = ModUtil.pcStringToMods(entry.mods);

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
                                cs:
                                    entry.force_cs !== -1
                                        ? entry.force_cs
                                        : undefined,
                                ar:
                                    entry.force_ar !== -1
                                        ? entry.force_ar
                                        : undefined,
                                od:
                                    entry.force_od !== -1
                                        ? entry.force_od
                                        : undefined,
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
            }
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
