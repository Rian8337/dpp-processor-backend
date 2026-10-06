import { schema } from "@/database/schema";
import type { Database } from "@/database/types";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";

export const migrationsFolder = fileURLToPath(
    new URL("../../drizzle", import.meta.url),
);

/**
 * An in-memory Postgres database for a test. Disposing closes it.
 */
export interface TestDatabase extends AsyncDisposable {
    readonly db: Database;
}

/**
 * Creates an in-memory Postgres (PGlite) database with all migrations applied.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
    const client = new PGlite();
    const db = drizzle(client, { schema, casing: "snake_case" });

    await migrate(db, { migrationsFolder });

    return { db, [Symbol.asyncDispose]: () => client[Symbol.asyncDispose]() };
}
