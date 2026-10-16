import { EnvironmentVariableKey as Key } from "@/types/env";
import type { DatabaseSettings } from "@dpp/server";
import { availableParallelism } from "node:os";
import { z } from "zod";

/**
 * Deployment settings, read from environment variables.
 */
export interface Config {
    readonly port: number;
    readonly database: DatabaseSettings;
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

const databaseSchema = z.object({
    [Key.DatabaseHost]: z.string().min(1),
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: z.string().min(1),
    [Key.DatabaseUser]: z.string().min(1),
    [Key.DatabasePassword]: z.string().default(""),
});

const schema = databaseSchema.extend({
    [Key.Port]: port,
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
 * @throws {ConfigError} If any variable is missing or invalid.
 */
function parse<T extends z.ZodType>(
    target: T,
    env: NodeJS.ProcessEnv,
): z.infer<T> {
    // An empty variable (`CALCULATION_THREADS=`) counts as unset, instead of being coerced to 0.
    const present = Object.fromEntries(
        Object.entries(env).filter(([, value]) => value !== ""),
    );
    const result = target.safeParse(present);

    if (!result.success) {
        const problems = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );

        throw new ConfigError(
            `Invalid configuration:\n  ${problems.join("\n  ")}`,
        );
    }

    return result.data;
}

function toDatabaseSettings(
    values: z.infer<typeof databaseSchema>,
): DatabaseSettings {
    return {
        host: values[Key.DatabaseHost],
        port: values[Key.DatabasePort],
        name: values[Key.DatabaseName],
        user: values[Key.DatabaseUser],
        password: values[Key.DatabasePassword],
    };
}

/**
 * Reads and validates the configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const values = parse(schema, env);

    return {
        port: values[Key.Port],
        database: toDatabaseSettings(values),
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

/**
 * Reads only the database settings, for the prune command.
 *
 * @throws {ConfigError} If any database variable is missing or invalid.
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseSettings {
    return toDatabaseSettings(parse(databaseSchema, env));
}
