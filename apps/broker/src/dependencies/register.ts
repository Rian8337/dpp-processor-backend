import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import { registerInjectables } from "@dpp/server";
import type { DependencyContainer } from "tsyringe";
// Load injectable classes so their metadata is registered.
import "../clients";
import "../repositories";
import "../services";
import { dependencyTokens } from "./tokens";

/**
 * Instances created at startup rather than by the container.
 */
export interface RuntimeInstances {
    readonly config: Config;
    readonly db: Database;
}

/**
 * Registers runtime instances and every `@Injectable` class to a container.
 */
export function registerDependencies(
    container: DependencyContainer,
    instances: RuntimeInstances,
): void {
    container.registerInstance(dependencyTokens.config, instances.config);
    container.registerInstance(dependencyTokens.db, instances.db);
    registerInjectables(container);
}
