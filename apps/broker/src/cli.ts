import "./polyfills";
import { DatabaseConnection, loadEnvironmentVariables } from "@dpp/server";
import { fileURLToPath } from "node:url";
import { consoleOutput } from "./cli/output";
import { runCli } from "./cli/run";
import { fetchInfo } from "./clients/fetchInfo";
import { ConfigError, loadDatabaseConfig } from "./config/config";
import { schema } from "./database/schema";
import { RegistryRepository } from "./repositories/RegistryRepository";

/**
 * Manages the broker registry: `node dist/cli.mjs <command>`. Reads only the database variables. Applies pending
 * migrations first, so it works before the broker has ever started.
 */
async function main(): Promise<number> {
    loadEnvironmentVariables(true);

    await using database = new DatabaseConnection(
        loadDatabaseConfig(process.env),
        schema,
    );

    await database.migrate(
        fileURLToPath(new URL("./drizzle", import.meta.url)),
    );

    // Awaited so the connection stays open until the command finishes.
    return await runCli(process.argv.slice(2), {
        repository: new RegistryRepository(database.db),
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
