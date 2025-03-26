import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./drizzle/postgresql",
    schema: "./src/database/processor/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        user: process.env.PROCESSOR_DB_USERNAME!,
        host: process.env.PROCESSOR_DB_HOSTNAME!,
        database: process.env.PROCESSOR_DB_NAME!,
        password: process.env.PROCESSOR_DB_PASSWORD,
        port: parseInt(process.env.PROCESSOR_DB_PORT ?? "") || undefined,
    },
});
