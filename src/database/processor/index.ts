import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The processor's database connection pool.
 */
export const processorPool = new Pool({
    user: process.env.PROCESSOR_DB_USERNAME,
    host: process.env.PROCESSOR_DB_HOSTNAME,
    database: process.env.PROCESSOR_DB_NAME,
    password: process.env.PROCESSOR_DB_PASSWORD,
    port: parseInt(process.env.PROCESSOR_DB_PORT ?? "") || undefined,
});

/**
 * The processor's Drizzle database connection.
 */
export const processorDb = drizzle(processorPool, { casing: "snake_case" });
