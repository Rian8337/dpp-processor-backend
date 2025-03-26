import { bestScoresTable } from "../schema";

/**
 * Represents an osu!droid score that is considered the best performing score.
 */
export type OfficialDatabaseBestScore = typeof bestScoresTable.$inferSelect;
