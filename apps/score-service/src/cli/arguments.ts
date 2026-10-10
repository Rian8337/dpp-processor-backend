import { variantNameSchema } from "@dpp/shared";
import { parseArgs } from "node:util";
import { z } from "zod";

export type CliCommand =
    | {
          readonly name: "recalculate-scores" | "recalculate-total-pp";
          readonly job: string;
          readonly from: number;
          readonly to: number;
          readonly concurrency: number;
          readonly chunkSize: number;
      }
    | { readonly name: "job-status"; readonly job: string };

export class CliUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CliUsageError";
    }
}

/** Job IDs are stored as Postgres `integer`. */
const maxJobId = 2147483647;

/** Each worker issues its own broker and database calls, so the number of workers is capped. */
const maxConcurrency = 64;

const defaultConcurrency = 4;
const defaultChunkSize = 1000;

function parseInteger(option: string, value: string, max?: number): number {
    const schema =
        max === undefined ? z.int().positive() : z.int().positive().max(max);

    if (!/^\d+$/.test(value) || !schema.safeParse(Number(value)).success) {
        throw new CliUsageError(
            max === undefined
                ? `--${option} must be a positive integer`
                : `--${option} must be a positive integer of at most ${max}`,
        );
    }

    return Number(value);
}

function parseJobName(value: string | undefined, label: string): string {
    if (value === undefined) {
        throw new CliUsageError(`${label} is required`);
    }

    if (!variantNameSchema.safeParse(value).success) {
        throw new CliUsageError(
            `${label} must contain only lowercase letters, digits, and hyphens, and start with a letter or digit`,
        );
    }

    return value;
}

/**
 * @throws {CliUsageError}
 */
export function parseCliArguments(argv: readonly string[]): CliCommand {
    let parsed;

    try {
        parsed = parseArgs({
            args: [...argv],
            options: {
                name: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                concurrency: { type: "string" },
                "chunk-size": { type: "string" },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (e) {
        if (e instanceof TypeError) {
            throw new CliUsageError(e.message);
        }

        throw e;
    }

    const [command, ...rest] = parsed.positionals;
    const { values } = parsed;

    if (command === undefined) {
        throw new CliUsageError("A command is required");
    }

    if (command === "job-status") {
        if (rest.length !== 1) {
            throw new CliUsageError("job-status expects exactly one job name");
        }

        return {
            name: "job-status",
            job: parseJobName(rest[0], "The job name"),
        };
    }

    if (
        command !== "recalculate-scores" &&
        command !== "recalculate-total-pp"
    ) {
        throw new CliUsageError(`Unknown command: ${command}`);
    }

    if (rest.length > 0) {
        throw new CliUsageError(`Unexpected argument: ${rest[0]}`);
    }

    const job = parseJobName(values.name, "--name");

    if (values.from === undefined) {
        throw new CliUsageError("--from is required");
    }

    if (values.to === undefined) {
        throw new CliUsageError("--to is required");
    }

    const from = parseInteger("from", values.from, maxJobId);
    const to = parseInteger("to", values.to, maxJobId);

    if (from > to) {
        throw new CliUsageError("--from must not be greater than --to");
    }

    return {
        name: command,
        job,
        from,
        to,
        concurrency:
            values.concurrency === undefined
                ? defaultConcurrency
                : parseInteger(
                      "concurrency",
                      values.concurrency,
                      maxConcurrency,
                  ),
        chunkSize:
            values["chunk-size"] === undefined
                ? defaultChunkSize
                : parseInteger("chunk-size", values["chunk-size"], maxJobId),
    };
}
