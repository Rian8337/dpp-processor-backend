import "./polyfills";
import { DatabaseConnection, loadEnvironmentVariables } from "@dpp/server";
import { fileURLToPath } from "node:url";
import { consoleOutput } from "./cli/output";
import { parseCli, runAction } from "./cli/run";
import { fetchInfo } from "./clients/fetchInfo";
import { ConfigError, loadDatabaseConfig } from "./config/config";
import { schema } from "./database/schema";
import { RegistryRepository } from "./repositories/RegistryRepository";
import { RegistryAdminService } from "./services/RegistryAdminService";

/**
 * Manages the broker registry: `node dist/cli.mjs <command>`. The arguments are checked before any configuration is
 * read or the database is opened. Reads only the database variables. Applies pending migrations first, so it works
 * before the broker has ever started.
 */
async function main(): Promise<number> {
    const action = parseCli(process.argv.slice(2), consoleOutput);

    if (!action) {
        return 1;
    }

    loadEnvironmentVariables(true);

    await using database = new DatabaseConnection(
        loadDatabaseConfig(process.env),
        schema,
    );

    await database.migrate(
        fileURLToPath(new URL("./drizzle", import.meta.url)),
    );

    // Awaited so the connection stays open until the command finishes.
    const repository = new RegistryRepository(database.db);

    return await runAction(action, {
        repository,
        admin: new RegistryAdminService(repository),
        processors: { getInfo: fetchInfo },
        healthCheckTimeoutMs: 3000,
        out: consoleOutput,
    });
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (e: unknown) => {
        console.error(e instanceof ConfigError ? e.message : e);
        process.exitCode = 1;
    },
);
