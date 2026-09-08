import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";

/**
 * The game's database connection.
 */
export const officialDb = drizzle(
    createPool({
        user: process.env.OFFICIAL_DB_USERNAME,
        host: process.env.OFFICIAL_DB_HOSTNAME,
        database: process.env.OFFICIAL_DB_NAME,
        password: process.env.OFFICIAL_DB_PASSWORD,
        port: parseInt(process.env.OFFICIAL_DB_PORT ?? "") || undefined,
        namedPlaceholders: true,
        // MariaDB exposes JSON-typed columns (e.g. `mods`) via extended metadata,
        // which mysql2 auto-parses into objects/arrays. The rest of this codebase
        // expects such columns as raw strings (see `longtext()` in columns.helper.ts
        // and the manual `JSON.parse`/`ModUtil.deserializeMods` call sites), so keep
        // them as strings here instead.
        jsonStrings: true,
    }),
    { casing: "snake_case" },
);
