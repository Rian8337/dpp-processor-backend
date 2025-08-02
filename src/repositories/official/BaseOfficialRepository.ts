import { OfficialDb } from "@/database/official";

/**
 * Base repository for official database.
 */
export abstract class BaseOfficialRepository {
    constructor(
        /**
         * The official database connection.
         */
        protected readonly db: OfficialDb,
    ) {}
}
