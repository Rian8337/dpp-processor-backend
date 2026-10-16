import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { schema } from "./schema";

/**
 * A Drizzle database with the job progress schema. Both node-postgres (production) and PGlite (tests) databases are
 * assignable to it.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
