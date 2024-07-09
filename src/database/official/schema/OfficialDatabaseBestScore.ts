import { OfficialDatabaseScore } from "./OfficialDatabaseScore";

/**
 * Represents an osu!droid score that is considered the best performing score.
 */
export interface OfficialDatabaseBestScore extends OfficialDatabaseScore {
    readonly pp: number;
}
