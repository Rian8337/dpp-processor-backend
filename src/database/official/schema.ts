import {
    bigint,
    float,
    index,
    int,
    mediumint,
    mysqlTable,
    timestamp,
    tinyint,
    varchar,
} from "drizzle-orm/mysql-core";
import {
    baseScoreColumns,
    bestScoreColumns,
    scoreColumns,
} from "./columns.helper";

/**
 * The user table.
 */
export const usersTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}user`,
    {
        id: mediumint().primaryKey().autoincrement(),
        username: varchar({ length: 64 }).notNull().unique("uniq_username"),
        password: varchar({ length: 32 }).notNull(),
        email: varchar({ length: 128 }).notNull(),
        deviceid: varchar({ length: 255 }),
        score: bigint({ mode: "number" }).notNull().default(0),
        pp: float().notNull().default(0),
        playcount: int().notNull().default(0),
        accuracy: float().notNull().default(1),
        registTime: timestamp().defaultNow(),
        lastLoginTime: timestamp().defaultNow(),
        registIP: varchar("regist_ip", { length: 16 }),
        region: varchar({ length: 3 }).default("de"),
        active: tinyint().default(1),
        supporter: tinyint().default(0),
        banned: tinyint().default(0),
        restrictMode: tinyint().default(0),
        archived: tinyint().default(0),
    },
    (table) => [index("idx_id").on(table.id)],
);

/**
 * The score table.
 */
export const scoresTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score`,
    scoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_top_score").on(table.uid, table.filename),
        index("IDX_MARK").on(table.mark),
        index("IDX_HASH_FILENAME").on(table.hash, table.filename),
    ],
);

/**
 * The banned score table.
 */
export const bannedScoresTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_banned`,
    scoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_top_score").on(table.uid, table.filename),
        index("IDX_MARK").on(table.mark),
        index("IDX_HASH_FILENAME").on(table.hash, table.filename),
    ],
);

/**
 * The best score table.
 */
export const bestScoresTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_best`,
    bestScoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_hash_filename").on(table.hash, table.filename),
        index("idx_uid").on(table.uid),
    ],
);

/**
 * The banned best score table.
 */
export const bannedBestScoresTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_best_banned`,
    bestScoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_hash_filename").on(table.hash, table.filename),
        index("idx_uid").on(table.uid),
    ],
);

/**
 * The uncalculated score table.
 */
export const uncalculatedScoresTable = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_uncalculated`,
    {
        ...baseScoreColumns,

        /**
         * The name of the replay file associated with the score.
         */
        replayfilename: varchar({ length: 255 }),
    },
    (table) => [
        index("idx_uid").on(table.uid),
        index("idx_uid_hash").on(table.uid, table.hash),
        index("idx_hash_filename").on(table.hash, table.filename),
        index("idx_replayfilename").on(table.replayfilename),
    ],
);
