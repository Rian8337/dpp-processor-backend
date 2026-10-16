import type { DatabaseSettings } from "@dpp/server";
import type { OfficialDatabaseSettings } from "@/config/config";
import { OfficialDatabaseConnection } from "@/official/connection";
import { randomBytes } from "node:crypto";
import { createOfficialTables } from "@/official/schema";
import {
    generateMySQLDrizzleJson,
    generateMySQLMigration,
} from "drizzle-kit/api";
import { createConnection } from "mysql2/promise";

/**
 * Official tables under a random prefix, created on a test MariaDB server. Disposing drops them. Each test gets
 * its own prefix, so one server serves a whole test file.
 */
export interface OfficialTestDatabase extends AsyncDisposable {
    readonly connection: OfficialDatabaseConnection;
    readonly settings: OfficialDatabaseSettings;
}

export async function createOfficialTestDatabase(
    settings: DatabaseSettings,
): Promise<OfficialTestDatabase> {
    const prefix = `t${randomBytes(4).toString("hex")}_`;
    const admin = await createConnection({
        host: settings.host,
        port: settings.port,
        database: settings.name,
        user: settings.user,
        password: settings.password,
        multipleStatements: true,
    });

    // The tables as `src/official/schema.ts` declares them: the schema is the only description of the official
    // tables in this repository.
    const statements = await generateMySQLMigration(
        await generateMySQLDrizzleJson({}),
        await generateMySQLDrizzleJson(
            createOfficialTables(prefix),
            undefined,
            "snake_case",
        ),
    );

    for (const statement of statements) {
        await admin.query(statement);
    }

    const full = { ...settings, tablePrefix: prefix };
    const connection = new OfficialDatabaseConnection(full);

    return {
        connection,
        settings: full,
        [Symbol.asyncDispose]: async () => {
            await connection[Symbol.asyncDispose]();
            await admin.query(
                `DROP TABLE ${prefix}user, ${prefix}score, ${prefix}score_best, ${prefix}score_uncalculated`,
            );
            await admin.end();
        },
    };
}
