import { foreignKey, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { baseOsuDifficultyAttributesColumns } from "./columns.helper";
import { beatmaps } from "./beatmaps";
import { relations } from "drizzle-orm";

/**
 * The table for storing rebalance osu!standard difficulty attributes.
 */
export const rebalanceOsuDifficultyAttributes = pgTable(
    "rebalance_osu_difficulty_attributes",
    baseOsuDifficultyAttributesColumns,
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_rebalance_osu_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmaps.id],
        }).onDelete("cascade"),
        index("rebalance_osu_difficulty_attributes_main_idx").on(
            table.beatmapId,
            table.mods,
        ),
        index("rebalance_osu_difficulty_attributes_beatmap_idx").on(
            table.beatmapId,
        ),
    ],
);

/**
 * Relations for the {@link rebalanceOsuDifficultyAttributes} table.
 */
export const rebalanceOsuDifficultyAttributesRelations = relations(
    rebalanceOsuDifficultyAttributes,
    ({ one }) => ({
        /**
         * The beatmap associated with the difficulty attributes.
         */
        beatmap: one(beatmaps, {
            fields: [rebalanceOsuDifficultyAttributes.beatmapId],
            references: [beatmaps.id],
        }),
    }),
);

export type IRebalanceOsuDifficultyAttributes =
    typeof rebalanceOsuDifficultyAttributes.$inferSelect;

export type IRebalanceOsuDifficultyAttributesInsert =
    typeof rebalanceOsuDifficultyAttributes.$inferInsert;
