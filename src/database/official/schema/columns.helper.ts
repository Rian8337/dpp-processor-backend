import { ScoreRank } from "@rian8337/osu-base";
import {
    float,
    int,
    longtext,
    mediumint,
    serial,
    timestamp,
    tinyint,
    varchar,
} from "drizzle-orm/mysql-core";

/**
 * The columns of the score table.
 */
export const scoreColumns = {
    /**
     * The ID of the score.
     */
    id: serial().primaryKey(),

    /**
     * The ID of the user who achieved the score.
     */
    uid: mediumint().notNull(),

    /**
     * The name of the beatmap that the score was achieved on.
     */
    filename: varchar({ length: 255 }).notNull(),

    /**
     * The MD5 hash of the beatmap that the score was achieved on.
     */
    hash: varchar({ length: 36 }).notNull(),

    /**
     * The mods that were used to achieve the score.
     */
    mods: longtext().notNull().default("[]"),

    /**
     * The score value.
     */
    score: int().notNull().default(0),

    /**
     * The maximum combo achieved in the score.
     */
    combo: int().notNull().default(0),

    /**
     * The rank of the score.
     */
    mark: varchar({ length: 2 }).$type<ScoreRank>(),

    /**
     * The amount of gekis achieved in the score.
     */
    geki: mediumint().notNull().default(0),

    /**
     * The amount of 300s achieved in the score.
     */
    perfect: mediumint().notNull().default(0),

    /**
     * The amount of katus achieved in the score.
     */
    katu: mediumint().notNull().default(0),

    /**
     * The amount of 100s achieved in the score.
     */
    good: mediumint().notNull().default(0),

    /**
     * The amount of 50s achieved in the score.
     */
    bad: mediumint().notNull().default(0),

    /**
     * The amount of misses achieved in the score.
     */
    miss: mediumint().notNull().default(0),

    /**
     * The time when the score was achieved.
     */
    date: timestamp().notNull().defaultNow(),

    /**
     * The amount of slider ticks that were hit in the score.
     */
    sliderTickHit: tinyint(),

    /**
     * The amount of slider ends that were hit in the score.
     */
    sliderEndHit: tinyint(),

    /**
     * The accuracy of the score.
     */
    accuracy: float().notNull().default(0),

    /**
     * The pp value of the score.
     *
     * This is the final pp value, affected by {@link scoreColumns.ppMultiplier}. To get the raw pp value, divide by said multiplier.
     */
    pp: float(),

    /**
     * The pp multiplier of the score.
     *
     * This is applied directly to {@link scoreColumns.pp} during calculation.
     */
    ppMultiplier: float(),
} as const;

/**
 * The columns of the best score table.
 */
export const bestScoreColumns = {
    ...scoreColumns,

    /**
     * The pp value of the score.
     *
     * This is the final pp value, affected by {@link scoreColumns.ppMultiplier}. To get the raw pp value, divide by said multiplier.
     */
    pp: float().notNull(),

    /**
     * The pp multiplier of the score.
     *
     * This is applied directly to {@link scoreColumns.pp} during calculation.
     */
    ppMultiplier: float().notNull(),
} as const;
