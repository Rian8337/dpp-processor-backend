import { WhitelistDifficultyStatistics } from "../../../structures/WhitelistDifficultyStatistics";

/**
 * Represents a whitelisted beatmap.
 */
export interface IMapWhitelist {
    /**
     * The ID of the beatmap.
     */
    mapid: number;

    /**
     * The MD5 hash of the beatmap.
     */
    hashid: string;

    /**
     * The full name of the beatmap.
     */
    mapname: string;

    /**
     * Difficulty statistics for beatmap whitelisting query.
     */
    diffstat: WhitelistDifficultyStatistics;

    /**
     * Whether the ongoing whitelist scan is completed for this beatmap.
     */
    whitelistScanDone?: boolean;
}
