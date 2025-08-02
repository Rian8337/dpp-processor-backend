import { IUser } from "@/database/official/schema";

/**
 * Provides operations for interacting with users in the official database.
 */
export interface IUserRepository {
    /**
     * Obtains a user's information by their osu!droid account's user ID.
     *
     * @param uid The ID of the osu!droid account bound to the user.
     * @param columns The specific columns to retrieve.
     * @returns The user's information, or `null` if not found.
     */
    getFromUid<K extends keyof IUser>(
        uid: number,
        ...columns: K[]
    ): Promise<Pick<IUser, K> | null>;

    /**
     * Obtains a user's information by their osu!droid account's username.
     *
     * @param username The username of the osu!droid account. Must be between 2-20 characters long.
     * @param columns The specific columns to retrieve.
     * @returns The user's information, or `null` if not found.
     */
    getFromUsername<K extends keyof IUser>(
        username: string,
        ...columns: K[]
    ): Promise<Pick<IUser, K> | null>;

    /**
     * Updates the ranking of a user by their osu!droid account's user ID.
     *
     * This updates the user's performance points (PP) and accuracy based on the provided values.
     *
     * @param uid The ID of the osu!droid account bound to the user.
     * @param pp The new performance points value. Must be a non-negative number.
     * @param accuracy The new accuracy value. Must be between 0 and 1.
     * @returns Whether the update was successful.
     */
    updateRanking(uid: number, pp: number, accuracy: number): Promise<boolean>;

    /**
     * Resets the ranking of a user by their osu!droid account's user ID.
     *
     * This sets their performance points (PP) to 0 and accuracy to 100%.
     *
     * @param uid The ID of the osu!droid account bound to the user.
     */
    resetRanking(uid: number): Promise<boolean>;
}
