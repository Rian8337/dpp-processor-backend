import { IUserBind } from "@/database/mongodb/schema";
import { FindOneOptions } from "@/types";
import { WithId } from "mongodb";

/**
 * Provides operations for interacting with user bindings in the MongoDB database.
 */
export interface IUserBindRepository {
    /**
     * Obtains a user binding by its osu!droid account's user ID.
     *
     * @param uid The ID of the osu!droid account bound to the user.
     * @param options Options for the find operation.
     * @returns The user binding with the specified osu!droid account's user ID, or `null` if not found.
     */
    getFromUid(
        uid: number,
        options?: FindOneOptions<IUserBind>,
    ): Promise<WithId<IUserBind> | null>;
}
