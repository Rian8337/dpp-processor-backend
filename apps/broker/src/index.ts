import "./polyfills";
import {
    createShutdownHandler,
    DatabaseConnection,
    getContainer,
    GracefulServer,
    installLogPrefix,
    loadEnvironmentVariables,
} from "@dpp/server";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config/config";
import { schema } from "./database/schema";
import { registerDependencies } from "./dependencies/register";
import { dependencyTokens } from "./dependencies/tokens";
import type { IRegistryService } from "./services/IRegistryService";

async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);

    // Kept for the process's whole lifetime, so never disposed.
    installLogPrefix("broker");

    // Installed first so a SIGHUP during startup does not hit Node's default action (exit); it is ignored until
    // the registry has loaded.
    let registry: IRegistryService | undefined;

    process.on("SIGHUP", () => {
        const loaded = registry;

        if (!loaded) {
            return;
        }

        void loaded.reload().then((reloaded) => {
            if (reloaded) {
                console.log(`Reloaded registry: ${loaded.summary()}`);
            }
        });
    });

    // Released in reverse order on shutdown: server, timers, usage summaries, then database.
    const resources = new AsyncDisposableStack();
    const container = getContainer();

    try {
        const database = resources.use(
            new DatabaseConnection(config.database, schema),
        );

        await database.db.execute(sql`select 1`);
        await database.migrate(
            fileURLToPath(new URL("./drizzle", import.meta.url)),
        );

        registerDependencies(container, { config, db: database.db });

        const registryService = container.resolve(
            dependencyTokens.registryService,
        );
        const health = container.resolve(dependencyTokens.healthMonitor);
        const usage = container.resolve(dependencyTokens.usageStats);

        await registryService.load();
        registry = registryService;
        console.log(`Loaded registry: ${registryService.summary()}`);

        // Down processors do not stop startup; they become available once a later check succeeds.
        await health.checkAll();

        resources.use(usage.start());
        resources.use(registryService.startReloading());
        resources.use(health.start());

        const server = resources.use(new GracefulServer());
        const port = await server.listen(
            createApp(container, server.middleware),
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

    const shutdown = createShutdownHandler({
        resources,
        // In-flight forwards may take up to the processor timeout; let them finish.
        timeoutMs: (config.processor.timeoutSeconds + 5) * 1000,
    });

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((e: unknown) => {
    console.error("Startup failed:", e instanceof ConfigError ? e.message : e);
    process.exit(1);
});
