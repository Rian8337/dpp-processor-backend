import { relations } from "drizzle-orm";
import { foreignKey, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { beatmaps } from "./beatmaps";
import { baseDroidDifficultyAttributesColumns } from "./columns.helper";

/**
 * The table for storing live osu!droid difficulty attributes.
 */
export const liveDroidDifficultyAttributes = pgTable(
    "live_droid_difficulty_attributes",
    baseDroidDifficultyAttributesColumns,
    (table) => [
        primaryKey({ columns: [table.beatmapId, table.mods] }),
        foreignKey({
            name: "fk_live_droid_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmaps.id],
        }).onDelete("cascade"),
        index("live_droid_difficulty_attributes_main_idx").on(
            table.beatmapId,
            table.mods,
        ),
        index("live_droid_difficulty_attributes_beatmap_idx").on(
            table.beatmapId,
        ),
    ],
);

/**
 * Relations for the {@link liveDroidDifficultyAttributes} table.
 */
export const liveDroidDifficultyAttributesRelations = relations(
    liveDroidDifficultyAttributes,
    ({ one }) => ({
        /**
         * The beatmap associated with the difficulty attributes.
         */
        beatmap: one(beatmaps, {
            fields: [liveDroidDifficultyAttributes.beatmapId],
            references: [beatmaps.id],
        }),
    }),
);

export type ILiveDroidDifficultyAttributes =
    typeof liveDroidDifficultyAttributes.$inferSelect;

export type ILiveDroidDifficultyAttributesInsert =
    typeof liveDroidDifficultyAttributes.$inferInsert;
