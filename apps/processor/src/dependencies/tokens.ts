import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import type { Config } from "@/config/config";
import type { VariantManifest } from "@/manifest/manifest";
import type { Database } from "@/database/types";
import type { IDifficultyAttributesRepository } from "@/repositories/IDifficultyAttributesRepository";
import type { IBeatmapServiceClient } from "@/clients/IBeatmapServiceClient";
import type { IBeatmapService } from "@/services/IBeatmapService";
import type { IDifficultyCacheService } from "@/services/IDifficultyCacheService";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    algorithm: Symbol.for("algorithm") as InjectionToken<Algorithm>,
    calculationRunner: Symbol.for(
        "calculationRunner",
    ) as InjectionToken<ICalculationRunner>,
    config: Symbol.for("config") as InjectionToken<Config>,
    manifest: Symbol.for("manifest") as InjectionToken<VariantManifest>,
    db: Symbol.for("db") as InjectionToken<Database>,
    difficultyAttributesRepository: Symbol.for(
        "difficultyAttributesRepository",
    ) as InjectionToken<IDifficultyAttributesRepository>,
    beatmapServiceClient: Symbol.for(
        "beatmapServiceClient",
    ) as InjectionToken<IBeatmapServiceClient>,
    beatmapService: Symbol.for(
        "beatmapService",
    ) as InjectionToken<IBeatmapService>,
    difficultyCacheService: Symbol.for(
        "difficultyCacheService",
    ) as InjectionToken<IDifficultyCacheService>,
} satisfies Record<string, InjectionToken<unknown>>;
