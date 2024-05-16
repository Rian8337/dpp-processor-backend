import { config } from "dotenv";
import { Pool } from "pg";

config();

/**
 * The processor's database connection.
 */
export const processorPool = new Pool({
    user: process.env.PROCESSOR_DB_USERNAME,
    host: process.env.PROCESSOR_DB_HOSTNAME,
    database: process.env.PROCESSOR_DB_NAME,
    password: process.env.PROCESSOR_DB_PASSWORD,
    port: parseInt(process.env.PROCESSOR_DB_PORT ?? "") || undefined,
});
