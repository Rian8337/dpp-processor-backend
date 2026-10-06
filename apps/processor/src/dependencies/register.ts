import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { VariantManifest } from "@/manifest/manifest";
import type { DependencyContainer, InjectionToken } from "tsyringe";
import type { constructor } from "tsyringe/dist/typings/types";
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

    // Reflect metadata is untyped; `Injectable` writes these values.
    const classes =
        (Reflect.getMetadata("classes", globalThis) as
            | constructor<unknown>[]
            | undefined) ?? [];

    for (const cls of classes) {
        const token = Reflect.getMetadata("registrationToken", cls) as
            | InjectionToken<unknown>
            | undefined;

        if (!token) {
            throw new Error(
                `Class ${cls.name} has no registration token; decorate it with @Injectable`,
            );
        }

        container.registerSingleton(token, cls);
    }
}
