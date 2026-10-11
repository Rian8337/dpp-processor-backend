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
import { MongoConnections } from "./mongo/connections";
import { OfficialDatabaseConnection } from "./official/connection";

async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);

    // Kept for the process's whole lifetime, so never disposed.
    installLogPrefix("score-service");

    // Released in reverse order on shutdown: server (stops accepting first), watcher, scheduler, dan course timer, then
    // the databases.
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

        const official = resources.use(
            new OfficialDatabaseConnection(config.official),
        );

        await official.db.execute(sql`select 1`);

        const mongo = resources.use(
            await MongoConnections.connect(config.mongo),
        );

        registerDependencies(container, {
            cliConfig: config,
            config,
            db: database.db,
            officialDb: official.db,
            officialTables: official.tables,
            aliceDb: mongo.aliceDb,
            elainaDb: mongo.elainaDb,
        });

        const danCourses = container.resolve(dependencyTokens.danCourseService);

        await danCourses.load();
        resources.use(
            danCourses.startRefreshing(config.danCourseRefreshMinutes),
        );

        // Registered before the server so that shutdown closes the server first; started after it is listening.
        const scheduler = resources.use(
            container.resolve(dependencyTokens.uncalculatedScheduler),
        );
        const watcher = resources.use(
            container.resolve(dependencyTokens.replayWatcher),
        );
        const server = resources.use(new GracefulServer());
        const port = await server.listen(
            createApp(container, server.middleware),
            config.port,
            config.host,
        );

        console.log(`Listening on ${config.host}:${port.toString()}`);

        await watcher.start();
        scheduler.start();
    } catch (e) {
        await resources.disposeAsync().catch((disposeError: unknown) => {
            console.error(
                "Failed to release resources after a startup failure:",
                disposeError,
            );
        });

        throw e;
    }

    const shutdown = createShutdownHandler({ resources, timeoutMs: 30_000 });

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((e: unknown) => {
    console.error("Startup failed:", e instanceof ConfigError ? e.message : e);
    process.exit(1);
});
