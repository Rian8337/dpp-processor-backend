import { usersTable } from "../schema";

/**
 * Represents an osu!droid player.
 */
export type OfficialDatabaseUser = typeof usersTable.$inferSelect;
