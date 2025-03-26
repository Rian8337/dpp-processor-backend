import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./drizzle/mysql",
    schema: "./src/database/official/schema.ts",
    dialect: "mysql",
    dbCredentials: {
        user: process.env.OFFICIAL_DB_USERNAME!,
        host: process.env.OFFICIAL_DB_HOSTNAME!,
        database: process.env.OFFICIAL_DB_NAME!,
        password: process.env.OFFICIAL_DB_PASSWORD,
    },
});
