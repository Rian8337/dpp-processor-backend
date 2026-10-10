import type { CliConfig, Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { OfficialDatabase } from "@/official/connection";
import type { OfficialTables } from "@/official/schema";
import { parseReplay } from "@/replays/parseReplay";
import { registerInjectables } from "@dpp/server";
import type { Db } from "mongodb";
import type { DependencyContainer } from "tsyringe";
// Load injectable classes so their metadata is registered. Task 16 adds `../jobs/JobRunner` here.
import "../clients";
import "../replays/ReplayStore";
import "../repositories";
import "../runtime/ReplayWatcher";
import "../runtime/UncalculatedScheduler";
import "../services";
import { dependencyTokens } from "./tokens";

export interface RuntimeInstances {
    readonly cliConfig: CliConfig;
    /** Server only. */
    readonly config?: Config;
    readonly db: Database;
    readonly officialDb: OfficialDatabase;
    readonly officialTables: OfficialTables;
    /** Server only. */
    readonly aliceDb?: Db;
    readonly elainaDb?: Db;
}

/**
 * Registers runtime instances and every `@Injectable` class. The CLI passes no server-only instances; classes that
 * need them are registered but never resolved there.
 */
export function registerDependencies(
    container: DependencyContainer,
    instances: RuntimeInstances,
): void {
    container.registerInstance(dependencyTokens.cliConfig, instances.cliConfig);

    if (instances.config) {
        container.registerInstance(dependencyTokens.config, instances.config);
    }

    container.registerInstance(dependencyTokens.db, instances.db);
    container.registerInstance(
        dependencyTokens.officialDb,
        instances.officialDb,
    );
    container.registerInstance(
        dependencyTokens.officialTables,
        instances.officialTables,
    );

    if (instances.aliceDb) {
        container.registerInstance(dependencyTokens.aliceDb, instances.aliceDb);
    }

    if (instances.elainaDb) {
        container.registerInstance(
            dependencyTokens.elainaDb,
            instances.elainaDb,
        );
    }

    container.registerInstance(dependencyTokens.replayParser, parseReplay);
    registerInjectables(container);
}
