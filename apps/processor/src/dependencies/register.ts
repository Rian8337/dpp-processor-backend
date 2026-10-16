import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { VariantManifest } from "@/manifest/manifest";
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
    readonly manifest: VariantManifest;
    readonly algorithm: Algorithm;
    readonly runner: ICalculationRunner;
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
    container.registerInstance(dependencyTokens.manifest, instances.manifest);
    container.registerInstance(dependencyTokens.algorithm, instances.algorithm);
    container.registerInstance(
        dependencyTokens.calculationRunner,
        instances.runner,
    );
    container.registerInstance(dependencyTokens.db, instances.db);
    registerInjectables(container);
}
