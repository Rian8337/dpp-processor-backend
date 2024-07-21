import { PPEntry } from "../../../structures/PPEntry";

/**
 * Represents a Discord user who has at least one osu!droid account binded.
 */
export interface IUserBind {
    /**
     * The Discord ID of the user.
     */
    discordid: string;

    /**
     * The UID of the osu!droid account binded to the user.
     */
    uid: number;

    /**
     * The username of the osu!droid account bound to the user.
     */
    username: string;

    /**
     * The total droid performance points (dpp) that the user has.
     */
    pptotal: number;

    /**
     * The play count of the user (how many scores the user has submitted into the dpp system).
     */
    playc: number;

    /**
     * The droid performance points entries of the user.
     */
    pp: PPEntry[];

    /*
     * The UID of osu!droid accounts that are binded to the user.
     *
     * A user can only bind up to 2 osu!droid accounts, therefore
     * the maximum length of this array will never exceed 2.
     */
    previous_bind: number[];

    /**
     * The weighted accuracy of the player.
     */
    weightedAccuracy: number;

    /**
     * Whether the replay transfer process has completed for this player.
     */
    dppTransferComplete?: boolean;
}
