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
    }),
    { casing: "snake_case" },
);
