import { EnvironmentVariableKey as Key } from "@/types/env";
import type { DatabaseSettings } from "@dpp/server";
import { z } from "zod";

/**
 * A value for Express's `trust proxy` setting: `true`, `false`, a hop count, or addresses and subnets.
 */
export type TrustProxySetting = boolean | number | string;

/**
 * Deployment settings, read from environment variables.
 */
export interface Config {
    readonly port: number;
    readonly database: DatabaseSettings;
    readonly processor: {
        /**
         * Sent to every processor in `X-Api-Key`; each processor's `API_KEY`.
         */
        readonly apiKey: string;
        readonly timeoutSeconds: number;
    };
    readonly healthCheck: {
        readonly intervalSeconds: number;
        readonly timeoutSeconds: number;
    };
    readonly registryReloadIntervalSeconds: number;

    /**
     * Requests per minute per IP for callers without a key. 0 refuses requests without a key.
     */
    readonly anonymousRateLimit: number;
    readonly trustProxy: TrustProxySetting;

    /**
     * 0 disables usage summaries.
     */
    readonly usageSummaryIntervalSeconds: number;
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
const seconds = z.coerce.number().int().min(1);

const databaseShape = {
    [Key.DatabaseHost]: z.string().min(1),
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: z.string().min(1),
    [Key.DatabaseUser]: z.string().min(1),
    [Key.DatabasePassword]: z.string().default(""),
};

const databaseSchema = z.object(databaseShape);

const schema = z.object({
    ...databaseShape,
    [Key.Port]: port,
    [Key.ProcessorApiKey]: z.string().min(16, "must be at least 16 characters"),
    [Key.ProcessorTimeoutSeconds]: seconds.default(30),
    [Key.HealthCheckIntervalSeconds]: seconds.default(10),
    [Key.HealthCheckTimeoutSeconds]: seconds.default(3),
    [Key.RegistryReloadIntervalSeconds]: seconds.default(30),
    [Key.AnonymousRateLimit]: z.coerce.number().int().min(0).default(30),
    [Key.TrustProxy]: z.string().default("false").transform(parseTrustProxy),
    [Key.UsageSummaryIntervalSeconds]: z.coerce
        .number()
        .int()
        .min(0)
        .default(300),
});

function parseTrustProxy(value: string): TrustProxySetting {
    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    return /^\d+$/.test(value) ? Number(value) : value;
}

function parse<T extends z.ZodType>(
    target: T,
    env: NodeJS.ProcessEnv,
): z.infer<T> {
    // An empty variable (`PORT=`) counts as unset, instead of being coerced to 0.
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
 * Reads and validates the broker's configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const values = parse(schema, env);

    return {
        port: values[Key.Port],
        database: toDatabaseSettings(values),
        processor: {
            apiKey: values[Key.ProcessorApiKey],
            timeoutSeconds: values[Key.ProcessorTimeoutSeconds],
        },
        healthCheck: {
            intervalSeconds: values[Key.HealthCheckIntervalSeconds],
            timeoutSeconds: values[Key.HealthCheckTimeoutSeconds],
        },
        registryReloadIntervalSeconds:
            values[Key.RegistryReloadIntervalSeconds],
        anonymousRateLimit: values[Key.AnonymousRateLimit],
        trustProxy: values[Key.TrustProxy],
        usageSummaryIntervalSeconds: values[Key.UsageSummaryIntervalSeconds],
    };
}

/**
 * Reads only the database settings, for the CLI.
 *
 * @throws {ConfigError} If any database variable is missing or invalid.
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseSettings {
    return toDatabaseSettings(parse(databaseSchema, env));
}
