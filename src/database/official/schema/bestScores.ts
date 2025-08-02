import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { bestScoreColumns } from "./columns.helper";

/**
 * The table for storing best scores.
 */
export const bestScores = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score_best`,
    bestScoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_hash_filename").on(table.hash, table.filename),
        index("idx_uid").on(table.uid),
    ],
);

export type IBestScore = typeof bestScores.$inferSelect;
export type IBestScoreInsert = typeof bestScores.$inferInsert;
