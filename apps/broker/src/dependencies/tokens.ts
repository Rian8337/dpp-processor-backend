import type { IProcessorClient } from "@/clients/IProcessorClient";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { IRegistryService } from "@/services/IRegistryService";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    config: Symbol.for("config") as InjectionToken<Config>,
    db: Symbol.for("db") as InjectionToken<Database>,
    healthMonitor: Symbol.for(
        "healthMonitor",
    ) as InjectionToken<IHealthMonitor>,
    processorClient: Symbol.for(
        "processorClient",
    ) as InjectionToken<IProcessorClient>,
    registryRepository: Symbol.for(
        "registryRepository",
    ) as InjectionToken<IRegistryRepository>,
    registryService: Symbol.for(
        "registryService",
    ) as InjectionToken<IRegistryService>,
} satisfies Record<string, InjectionToken<unknown>>;
