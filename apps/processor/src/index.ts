import "./polyfills";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { createAlgorithm } from "./algorithms/createAlgorithm";
import { createApp } from "./app";
import type { ICalculationRunner } from "./calculation/ICalculationRunner";
import { InlineRunner } from "./calculation/InlineRunner";
import { PiscinaRunner } from "./calculation/PiscinaRunner";
import { ConfigError, loadConfig } from "./config/config";
import { DatabaseConnection } from "./database/DatabaseConnection";
import { getContainer } from "./dependencies/container";
import { registerDependencies } from "./dependencies/register";
import { loadEnvironmentVariables } from "./env";
import { loadManifest } from "./manifest/manifest";
import { GracefulServer } from "./runtime/GracefulServer";
import { installLogPrefix } from "./runtime/logging";
import { createShutdownHandler } from "./runtime/shutdown";

async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);
    const manifest = await loadManifest(
        new URL("./manifest.json", import.meta.url),
        process.env,
    );

    // Kept for the process's whole lifetime, so never disposed.
    installLogPrefix(manifest.id);

    console.log(
        `Starting variant ${manifest.id} (${manifest.mode}, ${manifest.algorithm}, ${manifest.calculatorVersion})`,
    );

    // Released in reverse order on shutdown: server, then runner, then database.
    const resources = new AsyncDisposableStack();

    try {
        const database = resources.use(new DatabaseConnection(config.database));

        await database.db.execute(sql`select 1`);
        await database.migrate(
            fileURLToPath(new URL("./drizzle", import.meta.url)),
        );

        const algorithm = createAlgorithm(manifest.mode);

        const runner = resources.use<ICalculationRunner>(
            config.calculation.threads === 0
                ? new InlineRunner(algorithm)
                : new PiscinaRunner({
                      mode: manifest.mode,
                      threads: config.calculation.threads,
                      maxQueue: config.calculation.maxQueue,
                  }),
        );

        registerDependencies(getContainer(), {
            config,
            manifest,
            algorithm,
            runner,
            db: database.db,
        });

        const server = resources.use(new GracefulServer());
        const port = await server.listen(
            createApp(getContainer(), server.middleware),
            config.port,
        );

        console.log(`Listening on port ${port.toString()}`);
    } catch (e) {
        await resources.disposeAsync().catch((disposeError: unknown) => {
            console.error(
                "Failed to release resources after a startup failure:",
                disposeError,
            );
        });

        throw e;
    }

    const shutdown = createShutdownHandler({ resources });

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((e: unknown) => {
    console.error("Startup failed:", e instanceof ConfigError ? e.message : e);
    process.exit(1);
});
