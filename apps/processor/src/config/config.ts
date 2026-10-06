import { EnvironmentVariableKey as Key } from "@/types/env";
import { availableParallelism } from "node:os";
import { z } from "zod";

/**
 * Deployment settings, read from environment variables.
 */
export interface Config {
    readonly port: number;
    readonly database: {
        readonly host: string;
        readonly port: number;
        readonly name: string;
        readonly user: string;
        readonly password: string;
    };
    readonly beatmapService: {
        /**
         * Base URL without a trailing slash, e.g. `http://localhost:3017/api/beatmap`.
         */
        readonly url: string;
        readonly key: string;
    };
    readonly apiKey: string;
    readonly calculation: {
        /**
         * Worker threads. 0 runs calculations on the main thread.
         */
        readonly threads: number;
        readonly maxQueue: number;
    };
}

/**
 * Thrown when environment variables are missing or invalid. The message names every invalid variable but never
 * includes values.
 */
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConfigError";
    }
}

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
    [Key.Port]: port,
    [Key.DatabaseHost]: z.string().min(1),
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: z.string().min(1),
    [Key.DatabaseUser]: z.string().min(1),
    [Key.DatabasePassword]: z.string().default(""),
    [Key.BeatmapServiceUrl]: z.url(),
    [Key.BeatmapServiceKey]: z.string().default(""),
    [Key.ApiKey]: z.string().min(16, "must be at least 16 characters"),
    [Key.CalculationThreads]: z.coerce
        .number()
        .int()
        .min(0)
        .default(availableParallelism()),
    [Key.CalculationMaxQueue]: z.coerce.number().int().min(1).default(100),
});

/**
 * Reads and validates the configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const result = schema.safeParse(env);

    if (!result.success) {
        const problems = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );

        throw new ConfigError(
            `Invalid configuration:\n  ${problems.join("\n  ")}`,
        );
    }

    const values = result.data;

    return {
        port: values[Key.Port],
        database: {
            host: values[Key.DatabaseHost],
            port: values[Key.DatabasePort],
            name: values[Key.DatabaseName],
            user: values[Key.DatabaseUser],
            password: values[Key.DatabasePassword],
        },
        beatmapService: {
            url: values[Key.BeatmapServiceUrl].replace(/\/+$/, ""),
            key: values[Key.BeatmapServiceKey],
        },
        apiKey: values[Key.ApiKey],
        calculation: {
            threads: values[Key.CalculationThreads],
            maxQueue: values[Key.CalculationMaxQueue],
        },
    };
}
