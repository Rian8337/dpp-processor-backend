import { RankedStatus } from "@rian8337/osu-base";
import { WhitelistStatus } from "../structures/WhitelistStatistics";
import { DatabaseManager } from "../database/managers/DatabaseManager";

/**
 * A utility class for whitelisted and blacklisted beatmaps.
 */
export abstract class WhitelistUtil {
    /**
     * Checks if a beatmap is whitelisted.
     *
     * @param hash The MD5 hash of the beatmap.
     * @returns Whether the beatmap is whitelisted.
     */
    static async getBeatmapWhitelistStatus(
        hash: string
    ): Promise<WhitelistStatus> {
        const entry =
            await DatabaseManager.elainaDb.collections.mapWhitelist.getOne(
                { hashid: hash },
                { projection: { hashid: 1 } }
            );

        if (!entry) {
            return "not whitelisted";
        }

        if (entry.hashid === hash) {
            return "updated";
        } else {
            return "whitelisted";
        }
    }

    /**
     * Determines whether a beatmap needs to be whitelisted
     * to be submitted into the droid pp system.
     * @param status
     */
    static beatmapNeedsWhitelisting(status: RankedStatus): boolean {
        return (
            status === RankedStatus.qualified || status <= RankedStatus.pending
        );
    }

    /**
     * Checks if a beatmap is blacklisted.
     *
     * @param beatmapID The ID of the beatmap.
     * @returns Whether the beatmap is blacklisted.
     */
    static async isBlacklisted(beatmapID: number): Promise<boolean> {
        return !!(await DatabaseManager.elainaDb.collections.mapBlacklist.getOne(
            { beatmapID: beatmapID }
        ));
    }
}
