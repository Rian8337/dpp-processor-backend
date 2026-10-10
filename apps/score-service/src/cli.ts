import "./polyfills";
import {
    DatabaseConnection,
    getContainer,
    installLogPrefix,
    loadEnvironmentVariables,
} from "@dpp/server";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli/run";
import { ConfigError, loadCliConfig } from "./config/config";
import { schema } from "./database/schema";
import { registerDependencies } from "./dependencies/register";
import { dependencyTokens } from "./dependencies/tokens";
import { OfficialDatabaseConnection } from "./official/connection";

/**
 * Recalculation jobs: `node dist/cli.mjs <command>`. Reads only the CLI variables. Applies pending migrations first.
 * SIGINT/SIGTERM let workers finish their current ID; the next run with the same name resumes.
 */
async function main(): Promise<number> {
    loadEnvironmentVariables(true);
    // Kept for the process lifetime, so never disposed.
    installLogPrefix("score-service");

    const config = loadCliConfig(process.env);

    await using database = new DatabaseConnection(config.database, schema);
    await using official = new OfficialDatabaseConnection(config.official);

    await database.migrate(
        fileURLToPath(new URL("./drizzle", import.meta.url)),
    );

    const container = getContainer();

    registerDependencies(container, {
        cliConfig: config,
        db: database.db,
        officialDb: official.db,
        officialTables: official.tables,
    });

    const abort = new AbortController();
    const stop = (signal: string) => {
        console.log(`Received ${signal}; finishing the current IDs`);
        abort.abort();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    // Awaited so the connections stay open until the command finishes.
    return await runCli(process.argv.slice(2), {
        runner: container.resolve(dependencyTokens.jobRunner),
        scores: container.resolve(dependencyTokens.scoreRecalculationService),
        totalPP: container.resolve(dependencyTokens.totalPPService),
        progress: container.resolve(dependencyTokens.jobProgressRepository),
        signal: abort.signal,
        out: console,
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
