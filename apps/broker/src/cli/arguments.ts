import { invalidNameMessage, isValidName } from "@/registry/names";
import { isValidUid } from "@/registry/uids";
import type { UserRole } from "@dpp/shared";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { CliError } from "./errors";

/**
 * Parses a command's arguments with `util.parseArgs`: unknown options are errors, and positionals are allowed.
 * Argument errors (unknown option, missing value) become {@link CliError}s.
 */
export function parseArguments<const T extends ParseArgsOptionsConfig>(
    args: string[],
    options: T,
) {
    try {
        return parseArgs<{
            args: string[];
            options: T;
            allowPositionals: true;
            strict: true;
        }>({ args, options, allowPositionals: true, strict: true });
    } catch (e) {
        if (
            e instanceof TypeError &&
            "code" in e &&
            typeof e.code === "string" &&
            e.code.startsWith("ERR_PARSE_ARGS")
        ) {
            throw new CliError(e.message);
        }

        throw e;
    }
}

/**
 * Checks that exactly the named positional arguments were given.
 */
export function expectPositionals(
    positionals: string[],
    names: readonly string[],
): string[] {
    if (positionals.length !== names.length) {
        throw new CliError(
            names.length === 0
                ? "Expected no arguments"
                : `Expected ${names.map((name) => `<${name}>`).join(" ")}`,
        );
    }

    return positionals;
}

export function requireValidName(name: string): void {
    if (!isValidName(name)) {
        throw new CliError(invalidNameMessage(name));
    }
}

/**
 * Reads a uid argument. The service checks the rules again; this fails before the database is opened.
 */
export function parseUid(value: string): number {
    const uid = /^[0-9]+$/.test(value) ? Number(value) : NaN;

    if (!isValidUid(uid)) {
        throw new CliError(`Invalid uid "${value}"`);
    }

    return uid;
}

/**
 * Reads a role argument: `admin`, `manager`, or `none` (no role, as `null`).
 */
export function parseRole(value: string): UserRole | null {
    if (value === "admin" || value === "manager") {
        return value;
    }

    if (value === "none") {
        return null;
    }

    throw new CliError(
        `Invalid role "${value}": expected admin, manager, or none`,
    );
}

/**
 * Reads `--limit`/`--unlimited`: a positive whole number, `null` for unlimited, or `undefined` if neither was given.
 */
export function parseLimit(
    limit: string | undefined,
    unlimited: boolean,
): number | null | undefined {
    if (limit !== undefined && unlimited) {
        throw new CliError("Pass only one of --limit or --unlimited");
    }

    if (unlimited) {
        return null;
    }

    if (limit === undefined) {
        return undefined;
    }

    const value = Number(limit);

    if (!Number.isInteger(value) || value < 1) {
        throw new CliError(
            `Invalid limit "${limit}": expected a whole number of requests per minute`,
        );
    }

    return value;
}

/**
 * Reads `--port`/`--url` into an instance base URL without a trailing slash. `--port` means a processor on this
 * machine.
 */
export function instanceUrl(values: { port?: string; url?: string }): string {
    const { port, url } = values;

    if (port !== undefined && url === undefined) {
        const number = Number(port);

        if (!Number.isInteger(number) || number < 1 || number > 65535) {
            throw new CliError(`Invalid port "${port}"`);
        }

        return `http://127.0.0.1:${number.toString()}`;
    }

    if (url !== undefined && port === undefined) {
        let parsed: URL;

        try {
            parsed = new URL(url);
        } catch {
            throw new CliError(`Invalid URL "${url}"`);
        }

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new CliError(`The URL must use http or https: "${url}"`);
        }

        if (parsed.username || parsed.password) {
            throw new CliError(
                `The URL must not contain credentials: "${parsed.host}"`,
            );
        }

        if (parsed.search || parsed.hash) {
            throw new CliError(
                `The URL must not have a query or fragment: "${url}"`,
            );
        }

        return url.replace(/\/+$/, "");
    }

    throw new CliError("Pass exactly one of --port or --url");
}
