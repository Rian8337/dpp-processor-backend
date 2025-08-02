import { IRecentPlay } from "@/database/mongodb/schema";
import { InsertManyResult } from "mongodb";

/**
 * Provides operations for interacting with recent plays in the MongoDB database.
 */
export interface IRecentPlayRepository {
    /**
     * Inserts multiple recent plays into the database.
     *
     * @param plays The recent plays to insert.
     * @returns The result of the insert operation.
     */
    insertMany(plays: IRecentPlay[]): Promise<InsertManyResult<IRecentPlay>>;
}
