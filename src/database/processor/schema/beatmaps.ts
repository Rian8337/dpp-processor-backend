import { RankedStatus } from "@rian8337/osu-base";
import { relations } from "drizzle-orm";
import {
    index,
    integer,
    pgTable,
    smallint,
    text,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";
import { liveDroidDifficultyAttributes } from "./liveDroidDifficultyAttributes";
import { liveOsuDifficultyAttributes } from "./liveOsuDifficultyAttributes";
import { rebalanceDroidDifficultyAttributes } from "./rebalanceDroidDifficultyAttributes";
import { rebalanceOsuDifficultyAttributes } from "./rebalanceOsuDifficultyAttributes";

/**
 * The table for storing beatmaps.
 */
export const beatmaps = pgTable(
    "beatmap",
    {
        id: integer().primaryKey(),
        hash: varchar({ length: 32 }).notNull(),
        title: text().notNull(),
        hitLength: integer().notNull(),
        totalLength: integer().notNull(),
        maxCombo: integer(),
        objectCount: integer().notNull(),
        rankedStatus: smallint().$type<RankedStatus>().notNull(),
        lastChecked: timestamp().notNull(),
    },
    (table) => [
        index("beatmap_id_idx").on(table.id),
        index("beatmap_hash_idx").on(table.hash),
    ],
);

/**
 * Relations for the {@link beatmaps} table.
 */
export const beatmapRelations = relations(beatmaps, ({ many }) => ({
    /**
     * The osu!droid live difficulty attributes associated with the beatmap.
     */
    liveDroidDifficultyAttributes: many(liveDroidDifficultyAttributes),

    /**
     * The osu!standard live difficulty attributes associated with the beatmap.
     */
    liveOsuDifficultyAttributes: many(liveOsuDifficultyAttributes),

    /**
     * The osu!droid rebalance difficulty attributes associated with the beatmap.
     */
    rebalanceDroidDifficultyAttributes: many(
        rebalanceDroidDifficultyAttributes,
    ),

    /**
     * The osu!standard rebalance difficulty attributes associated with the beatmap.
     */
    rebalanceOsuDifficultyAttributes: many(rebalanceOsuDifficultyAttributes),
}));

export type IBeatmap = typeof beatmaps.$inferSelect;
export type IBeatmapInsert = typeof beatmaps.$inferInsert;
