import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";

config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env" });

/**
 * The game's database connection.
 */
export const officialDb = drizzle(
    createPool({
        user: process.env.OFFICIAL_DB_USERNAME,
        host: process.env.OFFICIAL_DB_HOSTNAME,
        database: process.env.OFFICIAL_DB_NAME,
        password: process.env.OFFICIAL_DB_PASSWORD,
        port: parseInt(process.env.OFFICIAL_DB_PORT ?? "3306") || undefined,
        namedPlaceholders: true,
    }),
    { casing: "snake_case", schema, mode: "default" },
);

/**
 * The type of the official database.
 */
export type OfficialDb = typeof officialDb;
