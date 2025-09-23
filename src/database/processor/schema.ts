import {
    doublePrecision,
    foreignKey,
    index,
    integer,
    pgTable,
    primaryKey,
    smallint,
    text,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";
import {
    baseDroidDifficultyAttributesColumns,
    baseOsuDifficultyAttributesColumns,
} from "./columns.helper";
import { RankedStatus } from "@rian8337/osu-base";

/**
 * The beatmap table.
 */
export const beatmapTable = pgTable(
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
 * The osu!droid live difficulty attributes table.
 */
export const liveDroidDifficultyAttributesTable = pgTable(
    "live_droid_difficulty_attributes",
    {
        ...baseDroidDifficultyAttributesColumns,

        /**
         * The difficulty corresponding to the visual skill.
         */
        visualDifficulty: doublePrecision().notNull(),

        /**
         * The amount of strains that are considered difficult with respect to the visual skill.
         */
        visualDifficultStrainCount: doublePrecision().notNull(),

        /**
         * Describes how much of visual difficulty is contributed to by hitcircles or sliders.
         *
         * A value closer to 1 indicates most of visual difficulty is contributed by hitcircles.
         *
         * A value closer to 0 indicates most of visual difficulty is contributed by sliders.
         */
        visualSliderFactor: doublePrecision().notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_live_droid_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmapTable.id],
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
 * The osu!droid rebalance difficulty attributes table.
 */
export const rebalanceDroidDifficultyAttributesTable = pgTable(
    "rebalance_droid_difficulty_attributes",
    {
        ...baseDroidDifficultyAttributesColumns,

        /**
         * The difficulty corresponding to the reading skill.
         */
        readingDifficulty: doublePrecision().notNull(),

        /**
         * The amount of notes that are considered difficult with respect to the reading skill.
         */
        readingDifficultNoteCount: doublePrecision().notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_rebalance_droid_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmapTable.id],
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
 * The osu!standard live difficulty attributes table.
 */
export const liveOsuDifficultyAttributesTable = pgTable(
    "live_osu_difficulty_attributes",
    baseOsuDifficultyAttributesColumns,
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_live_osu_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmapTable.id],
        }).onDelete("cascade"),
        index("live_osu_difficulty_attributes_main_idx").on(
            table.beatmapId,
            table.mods,
        ),
        index("live_osu_difficulty_attributes_beatmap_idx").on(table.beatmapId),
    ],
);

/**
 * The osu!standard rebalance difficulty attributes table.
 */
export const rebalanceOsuDifficultyAttributesTable = pgTable(
    "rebalance_osu_difficulty_attributes",
    baseOsuDifficultyAttributesColumns,
    (table) => [
        primaryKey({
            columns: [table.beatmapId, table.mods],
        }),
        foreignKey({
            name: "fk_rebalance_osu_difficulty_attributes_beatmap_id",
            columns: [table.beatmapId],
            foreignColumns: [beatmapTable.id],
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
 * The score calculation table.
 */
export const scoreCalculationTable = pgTable("score_calculation", {
    process_id: integer().primaryKey(),
    score_id: integer().notNull(),
});

/**
 * The total pp calculation table.
 */
export const totalPPCalculationTable = pgTable("total_pp_calculation", {
    id: integer().primaryKey(),
});
