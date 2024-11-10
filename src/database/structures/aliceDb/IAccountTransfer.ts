/**
 * Represents an osu!droid account transfer of a user.
 */
export interface IAccountTransfer {
    /**
     * The Discord ID of the user.
     */
    readonly discordId: string;

    /**
     * The uid of the osu!droid account to transfer scores to.
     */
    readonly transferUid: number;

    /**
     * The list of uids of osu!droid accounts to transfer scores from.
     */
    readonly transferList: number[];

    /**
     * Whether the transfer is done.
     */
    transferDone?: boolean;
}
