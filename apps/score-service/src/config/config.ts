import { EnvironmentVariableKey as Key } from "@/types/env";
import type { DatabaseSettings } from "@dpp/server";
import { variantNameSchema } from "@dpp/shared";
import { isAbsolute } from "node:path";
import { z } from "zod";

export interface OfficialDatabaseSettings extends DatabaseSettings {
    /**
     * Prepended to every official table name (`bbl_` gives `bbl_score`).
     */
    readonly tablePrefix: string;
}

export interface ReplayDirectories {
    /**
     * New replays from the game, watched by the replay listener.
     */
    readonly unprocessed: string;

    /**
     * Replays of `scores` rows, named `<score id>.odr`.
     */
    readonly online: string;

    /**
     * Replays of best pp scores, named `<score id>.odr`.
     */
    readonly best: string;

    /**
     * Replays of scores the game could not calculate.
     */
    readonly uncalculated: string;
}

/**
 * What both the CLI and the server need.
 */
export interface CliConfig {
    readonly database: DatabaseSettings;
    readonly official: OfficialDatabaseSettings;
    readonly broker: { readonly url: string; readonly apiKey: string };
    readonly beatmapService: {
        readonly url: string;
        /**
         * The priority lane, for interactive work.
         */
        readonly key: string;
        /**
         * The bulk lane, for recalculation.
         */
        readonly bulkKey: string;
    };
    readonly variants: { readonly liveDroid: string; readonly liveOsu: string };
    readonly replayDirectories: ReplayDirectories;
}

/**
 * The server's settings.
 */
export interface Config extends CliConfig {
    readonly port: number;
    readonly host: string;

    /**
     * Required in `X-Api-Key` by `GET /online-scores`.
     */
    readonly apiKey: string;
    readonly mongo: { readonly aliceUri: string; readonly elainaUri: string };
    readonly discordMetadata: { readonly url: string; readonly key: string };
    readonly replayConcurrency: number;
    readonly uncalculatedConcurrency: number;
    readonly uncalculatedIntervalMinutes: number;
    readonly danCourseRefreshMinutes: number;
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
const positive = z.coerce.number().int().min(1);
const text = z.string().min(1);
const url = z.url().transform((value) => value.replace(/\/+$/, ""));
const directory = text.refine(isAbsolute, "must be an absolute path");

const databaseShape = {
    [Key.DatabaseHost]: text,
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: text,
    [Key.DatabaseUser]: text,
    [Key.DatabasePassword]: z.string().default(""),
};

const databaseSchema = z.object(databaseShape);

const cliShape = {
    ...databaseShape,
    [Key.OfficialDbHost]: text,
    [Key.OfficialDbPort]: port.default(3306),
    [Key.OfficialDbName]: text,
    [Key.OfficialDbUser]: text,
    [Key.OfficialDbPassword]: z.string().default(""),
    [Key.OfficialDbPrefix]: z
        .string()
        .regex(/^[A-Za-z0-9_]*$/)
        .default("bbl_"),
    [Key.BrokerUrl]: url,
    [Key.BrokerApiKey]: text,
    [Key.BeatmapServiceUrl]: url,
    [Key.BeatmapServiceKey]: text,
    [Key.BeatmapServiceBulkKey]: text,
    [Key.LiveDroidVariant]: variantNameSchema,
    [Key.LiveOsuVariant]: variantNameSchema,
    [Key.UnprocessedReplayDir]: directory,
    [Key.OnlineReplayDir]: directory,
    [Key.BestReplayDir]: directory,
    [Key.UncalculatedReplayDir]: directory,
};

const cliSchema = z.object(cliShape);

const serverSchema = z.object({
    ...cliShape,
    [Key.Port]: port,
    [Key.Host]: text.default("127.0.0.1"),
    [Key.ApiKey]: z.string().min(16, "must be at least 16 characters"),
    [Key.AliceDbUri]: text,
    [Key.ElainaDbUri]: text,
    [Key.DiscordMetadataUrl]: z.url(),
    [Key.DiscordMetadataKey]: text,
    [Key.ReplayConcurrency]: positive.default(2),
    [Key.UncalculatedConcurrency]: positive.default(1),
    [Key.UncalculatedIntervalMinutes]: positive.default(10),
    [Key.DanCourseRefreshMinutes]: positive.default(60),
});

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

function toCliConfig(values: z.infer<typeof cliSchema>): CliConfig {
    return {
        database: toDatabaseSettings(values),
        official: {
            host: values[Key.OfficialDbHost],
            port: values[Key.OfficialDbPort],
            name: values[Key.OfficialDbName],
            user: values[Key.OfficialDbUser],
            password: values[Key.OfficialDbPassword],
            tablePrefix: values[Key.OfficialDbPrefix],
        },
        broker: {
            url: values[Key.BrokerUrl],
            apiKey: values[Key.BrokerApiKey],
        },
        beatmapService: {
            url: values[Key.BeatmapServiceUrl],
            key: values[Key.BeatmapServiceKey],
            bulkKey: values[Key.BeatmapServiceBulkKey],
        },
        variants: {
            liveDroid: values[Key.LiveDroidVariant],
            liveOsu: values[Key.LiveOsuVariant],
        },
        replayDirectories: {
            unprocessed: values[Key.UnprocessedReplayDir],
            online: values[Key.OnlineReplayDir],
            best: values[Key.BestReplayDir],
            uncalculated: values[Key.UncalculatedReplayDir],
        },
    };
}

/**
 * Reads and validates the server's configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const values = parse(serverSchema, env);

    return {
        ...toCliConfig(values),
        port: values[Key.Port],
        host: values[Key.Host],
        apiKey: values[Key.ApiKey],
        mongo: {
            aliceUri: values[Key.AliceDbUri],
            elainaUri: values[Key.ElainaDbUri],
        },
        discordMetadata: {
            url: values[Key.DiscordMetadataUrl],
            key: values[Key.DiscordMetadataKey],
        },
        replayConcurrency: values[Key.ReplayConcurrency],
        uncalculatedConcurrency: values[Key.UncalculatedConcurrency],
        uncalculatedIntervalMinutes: values[Key.UncalculatedIntervalMinutes],
        danCourseRefreshMinutes: values[Key.DanCourseRefreshMinutes],
    };
}

/**
 * Reads only what the CLI needs.
 *
 * @throws {ConfigError} If any of those variables is missing or invalid.
 */
export function loadCliConfig(env: NodeJS.ProcessEnv): CliConfig {
    return toCliConfig(parse(cliSchema, env));
}

/**
 * Reads only the score service's Postgres settings (for commands that touch nothing else, such as `job-status`).
 *
 * @throws {ConfigError} If any of those variables is missing or invalid.
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv): {
    readonly database: DatabaseSettings;
} {
    return { database: toDatabaseSettings(parse(databaseSchema, env)) };
}
