import { IUserBind } from "@/database/mongodb/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { FindOneOptions } from "@/types";
import { Db, WithId } from "mongodb";
import { inject } from "tsyringe";
import { BaseMongoRepository } from "./BaseMongoRepository";
import { IUserBindRepository } from "./IUserBindRepository";

/**
 * Provides operations for interacting with user bindings in the MongoDB database.
 */
@Repository(dependencyTokens.userBindRepository)
export class UserBindRepository
    extends BaseMongoRepository
    implements IUserBindRepository
{
    constructor(@inject(dependencyTokens.elainaDb) db: Db) {
        super(db);
    }

    private get collection() {
        return this.db.collection<IUserBind>("userbind");
    }

    getFromUid(
        uid: number,
        options?: FindOneOptions<IUserBind>,
    ): Promise<WithId<IUserBind> | null> {
        return this.collection.findOne({ uid }, options);
    }
}
