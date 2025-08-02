import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { scoreColumns } from "./columns.helper";

/**
 * The table for storing banned scores.
 */
export const bannedScores = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_banned`,
    scoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_top_score").on(table.uid, table.filename),
        index("IDX_MARK").on(table.mark),
        index("IDX_HASH_FILENAME").on(table.hash, table.filename),
    ],
);

export type IBannedScore = typeof bannedScores.$inferSelect;
export type IBannedScoreInsert = typeof bannedScores.$inferInsert;
