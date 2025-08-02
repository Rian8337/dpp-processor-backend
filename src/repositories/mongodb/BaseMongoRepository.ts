import { Db } from "mongodb";

/**
 * Base class for MongoDB repositories.
 */
export abstract class BaseMongoRepository {
    constructor(
        /**
         * The MongoDB database connection.
         */
        protected readonly db: Db,
    ) {}
}
