import { integer } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

/**
 * The table for storing total PP calculation progress.
 */
export const totalPPCalculations = pgTable("total_pp_calculation", {
    /**
     * The ID of the user for whom the total PP is calculated.
     */
    id: integer().primaryKey(),
});

export type ITotalPPCalculation = typeof totalPPCalculations.$inferSelect;
export type ITotalPPCalculationInsert = typeof totalPPCalculations.$inferInsert;
