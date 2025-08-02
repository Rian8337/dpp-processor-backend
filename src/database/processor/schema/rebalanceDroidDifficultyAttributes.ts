import { foreignKey, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { baseDroidDifficultyAttributesColumns } from "./columns.helper";
import { beatmaps } from "./beatmaps";
import { relations } from "drizzle-orm";

/**
 * The table for storing rebalance osu!droid difficulty attributes.
 */
export const rebalanceDroidDifficultyAttributes = pgTable(
    "rebalance_droid_difficulty_attributes",
    baseDroidDifficultyAttributesColumns,
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_rebalance_droid_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmaps.id],
        }).onDelete("cascade"),
        index("rebalance_droid_difficulty_attributes_main_idx").on(
            table.beatmapId,
            table.mods,
        ),
        index("rebalance_droid_difficulty_attributes_beatmap_idx").on(
            table.beatmapId,
        ),
    ],
);

/**
 * Relations for the {@link rebalanceDroidDifficultyAttributes} table.
 */
export const rebalanceDroidDifficultyAttributesRelations = relations(
    rebalanceDroidDifficultyAttributes,
    ({ one }) => ({
        /**
         * The beatmap associated with the difficulty attributes.
         */
        beatmap: one(beatmaps, {
            fields: [rebalanceDroidDifficultyAttributes.beatmapId],
            references: [beatmaps.id],
        }),
    }),
);

export type IRebalanceDroidDifficultyAttributes =
    typeof rebalanceDroidDifficultyAttributes.$inferSelect;

export type IRebalanceDroidDifficultyAttributesInsert =
    typeof rebalanceDroidDifficultyAttributes.$inferInsert;
