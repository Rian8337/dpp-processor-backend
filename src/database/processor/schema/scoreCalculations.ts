import { integer } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

/**
 * The table for storing score calculation progress.
 */
export const scoreCalculations = pgTable("score_calculation", {
    /**
     * The ID of the process.
     */
    processId: integer().primaryKey(),

    /**
     * The ID of the score being processed.
     */
    scoreId: integer().notNull(),
});

export type IScoreCalculation = typeof scoreCalculations.$inferSelect;
export type IScoreCalculationInsert = typeof scoreCalculations.$inferInsert;
