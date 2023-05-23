/**
 * Represents a droid performance point (dpp) ban information of a player.
 */
export interface IDPPBan {
    /**
     * The UID of the banned account.
     */
    uid: number;

    /**
     * The reason the account was banned.
     */
    reason: string;
}
