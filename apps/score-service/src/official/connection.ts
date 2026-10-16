import type { OfficialDatabaseSettings } from "@/config/config";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { createOfficialTables, type OfficialTables } from "./schema";

/**
 * The official database through Drizzle. Transactions are assignable to it.
 */
export type OfficialDatabase = MySql2Database;

/**
 * A pool of connections to the official MySQL database. Disposing closes the pool.
 */
export class OfficialDatabaseConnection implements AsyncDisposable {
    readonly db: OfficialDatabase;
    readonly tables: OfficialTables;
    private readonly pool: Pool;

    constructor(settings: OfficialDatabaseSettings) {
        this.pool = createPool({
            host: settings.host,
            port: settings.port,
            database: settings.name,
            user: settings.user,
            password: settings.password,
            connectionLimit: 10,
            // MariaDB marks some columns (e.g. `mods`) as JSON, which mysql2 would parse; keep them as strings.
            jsonStrings: true,
        });
        this.db = drizzle(this.pool, { casing: "snake_case" });
        this.tables = createOfficialTables(settings.tablePrefix);
    }

    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.end();
    }
}
