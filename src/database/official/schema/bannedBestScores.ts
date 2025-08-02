import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { bestScoreColumns } from "./columns.helper";

/**
 * The table for storing banned best scores.
 */
export const bannedBestScores = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_best_banned`,
    bestScoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_hash_filename").on(table.hash, table.filename),
        index("idx_uid").on(table.uid),
    ],
);

export type IBannedBestScore = typeof bannedBestScores.$inferSelect;
export type IBannedBestScoreInsert = typeof bannedBestScores.$inferInsert;
