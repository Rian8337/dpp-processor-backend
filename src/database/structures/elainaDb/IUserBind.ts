/**
 * Represents a Discord user who has at least one osu!droid account binded.
 */
export interface IUserBind {
    /**
     * The Discord ID of the user.
     */
    readonly discordid: string;

    /**
     * The UID of the osu!droid account binded to the user.
     */
    readonly uid: number;

    /**
     * The username of the osu!droid account bound to the user.
     */
    readonly username: string;
}
