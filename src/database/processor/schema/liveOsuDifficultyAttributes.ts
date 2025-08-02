import { foreignKey, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { baseOsuDifficultyAttributesColumns } from "./columns.helper";
import { beatmaps } from "./beatmaps";
import { relations } from "drizzle-orm";

/**
 * The table for storing live osu!standard difficulty attributes.
 */
export const liveOsuDifficultyAttributes = pgTable(
    "live_osu_difficulty_attributes",
    baseOsuDifficultyAttributesColumns,
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_live_osu_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmaps.id],
        }).onDelete("cascade"),
        index("live_osu_difficulty_attributes_main_idx").on(
            table.beatmapId,
            table.mods,
        ),
        index("live_osu_difficulty_attributes_beatmap_idx").on(table.beatmapId),
    ],
);

/**
 * Relations for the {@link liveOsuDifficultyAttributes} table.
 */
export const liveOsuDifficultyAttributesRelations = relations(
    liveOsuDifficultyAttributes,
    ({ one }) => ({
        /**
         * The beatmap associated with the difficulty attributes.
         */
        beatmap: one(beatmaps, {
            fields: [liveOsuDifficultyAttributes.beatmapId],
            references: [beatmaps.id],
        }),
    }),
);

export type ILiveOsuDifficultyAttributes =
    typeof liveOsuDifficultyAttributes.$inferSelect;

export type ILiveOsuDifficultyAttributesInsert =
    typeof liveOsuDifficultyAttributes.$inferInsert;
