import { SerializedMod } from "@rian8337/osu-base";
import {
    float,
    int,
    json,
    mediumint,
    serial,
    timestamp,
    varchar,
} from "drizzle-orm/mysql-core";

/**
 * The columns of the score table.
 */
export const scoreColumns = {
    id: serial().primaryKey(),
    uid: mediumint().notNull(),
    filename: varchar({ length: 255 }).notNull(),
    hash: varchar({ length: 36 }).notNull(),
    mode: varchar({ length: 16 }),
    mods: json().$type<SerializedMod[]>().notNull().default([]),
    score: int().notNull().default(0),
    combo: int().notNull().default(0),
    mark: varchar({ length: 2 }),
    geki: mediumint().notNull().default(0),
    perfect: mediumint().notNull().default(0),
    katu: mediumint().notNull().default(0),
    good: mediumint().notNull().default(0),
    bad: mediumint().notNull().default(0),
    miss: mediumint().notNull().default(0),
    date: timestamp().notNull().defaultNow(),
    accuracy: float().notNull().default(0),
    pp: float(),
    ppMultiplier: float(),
} as const;

/**
 * The columns of the best score table.
 */
export const bestScoreColumns = {
    ...scoreColumns,
    pp: float().notNull(),
    ppMultiplier: float().notNull(),
} as const;
