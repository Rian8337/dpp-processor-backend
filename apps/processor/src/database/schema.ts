import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    char,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

/**
 * Cached difficulty attributes, keyed by calculator version, beatmap file hash, and canonical difficulty-adjusting
 * mods.
 *
 * `calculator_version` leads the primary key: lookups match all three columns, so the order does not affect them,
 * and pruning by version can use the index prefix.
 */
export const difficultyAttributesTable = pgTable(
    "difficulty_attributes",
    {
        calculatorVersion: text().notNull(),
        beatmapHash: char({ length: 32 }).notNull(),
        mods: text().notNull(),
        attributes: jsonb()
            .$type<CacheableDifficultyAttributes<IDifficultyAttributes>>()
            .notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.calculatorVersion, table.beatmapHash, table.mods],
        }),
    ],
);

export const schema = { difficultyAttributesTable };
