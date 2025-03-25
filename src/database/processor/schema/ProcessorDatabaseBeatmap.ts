import { beatmapTable } from "../schema";

/**
 * Represents a beatmap in the processor's database.
 */
export type ProcessorDatabaseBeatmap = typeof beatmapTable.$inferSelect;
