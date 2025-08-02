import { ProcessorDb } from "@/database/processor";

/**
 * Base repository for processor database.
 */
export abstract class BaseProcessorRepository {
    constructor(
        /**
         * The processor database connection.
         */
        protected readonly db: ProcessorDb,
    ) {}
}
