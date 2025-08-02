import { index, mysqlTable } from "drizzle-orm/mysql-core";
import { scoreColumns } from "./columns.helper";

/**
 * The table for storing scores.
 */
export const scores = mysqlTable(
    `${process.env.OFFICIAL_DB_PREFIX!}score`,
    scoreColumns,
    (table) => [
        index("idx_id").on(table.id),
        index("idx_top_score").on(table.uid, table.filename),
        index("IDX_MARK").on(table.mark),
        index("IDX_HASH_FILENAME").on(table.hash, table.filename),
    ],
);

export type IScore = typeof scores.$inferSelect;
export type IScoreInsert = typeof scores.$inferInsert;
