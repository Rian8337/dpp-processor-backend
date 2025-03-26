import { scoresTable } from "../schema";

/**
 * Represents an osu!droid score.
 */
export type OfficialDatabaseScore = typeof scoresTable.$inferSelect;
