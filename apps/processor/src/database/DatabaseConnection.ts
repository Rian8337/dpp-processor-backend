import type { Config } from "@/config/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { schema } from "./schema";
import type { Database } from "./types";

/**
 * A connection pool to the variant's Postgres database. Disposing closes the pool.
 */
export class DatabaseConnection implements AsyncDisposable {
    private readonly pool: Pool;
    private readonly nodePgDb: NodePgDatabase<typeof schema>;

    /**
     * @param settings The connection settings.
     * @param pool The pool to use. Only tests pass this, to reach the pool without a server; it defaults to a pool
     * built from `settings`.
     */
    constructor(
        settings: Config["database"],
        pool = new Pool({
            host: settings.host,
            port: settings.port,
            database: settings.name,
            user: settings.user,
            password: settings.password,
        }),
    ) {
        this.pool = pool;

        // An error on an idle pooled client (server restart, idle timeout, network failure) is emitted on the pool.
        // Without a listener it would be an uncaught exception; the pool discards the client and reconnects on demand.
        this.pool.on("error", (error) => {
            console.error("Idle database client failed:", error.message);
        });

        this.nodePgDb = drizzle(this.pool, { schema, casing: "snake_case" });
    }

    /**
     * The database, for repositories.
     */
    get db(): Database {
        return this.nodePgDb;
    }

    /**
     * Applies pending migrations from `migrationsFolder`.
     */
    async migrate(migrationsFolder: string): Promise<void> {
        await migrate(this.nodePgDb, { migrationsFolder });
    }

    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.end();
    }
}
