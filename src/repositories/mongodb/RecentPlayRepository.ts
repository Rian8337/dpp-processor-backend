import { IRecentPlay } from "@/database/mongodb/schema";
import { dependencyTokens } from "@/dependencies/tokens";
import { Db, InsertManyResult } from "mongodb";
import { inject } from "tsyringe";
import { BaseMongoRepository } from "./BaseMongoRepository";
import { IRecentPlayRepository } from "./IRecentPlayRepository";
import { Repository } from "@/decorators/repository";

/**
 * Provides operations for interacting with recent plays in the MongoDB database.
 */
@Repository(dependencyTokens.recentPlayRepository)
export class RecentPlayRepository
    extends BaseMongoRepository
    implements IRecentPlayRepository
{
    constructor(@inject(dependencyTokens.aliceDb) db: Db) {
        super(db);
    }

    private get collection() {
        return this.db.collection<IRecentPlay>("recentplays");
    }

    insertMany(plays: IRecentPlay[]): Promise<InsertManyResult<IRecentPlay>> {
        return this.collection.insertMany(plays);
    }
}
