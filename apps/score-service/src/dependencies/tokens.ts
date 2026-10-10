import type { CliConfig, Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { IJobProgressRepository } from "@/repositories/IJobProgressRepository";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    /**
     * The server's config. Classes the CLI also uses depend on `cliConfig` instead.
     */
    config: Symbol.for("config") as InjectionToken<Config>,
    cliConfig: Symbol.for("cliConfig") as InjectionToken<CliConfig>,
    db: Symbol.for("db") as InjectionToken<Database>,
    jobProgressRepository: Symbol.for(
        "jobProgressRepository",
    ) as InjectionToken<IJobProgressRepository>,
} satisfies Record<string, InjectionToken<unknown>>;
