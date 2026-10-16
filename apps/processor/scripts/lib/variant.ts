import { Modes } from "@rian8337/osu-base";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export type Algorithm = "live" | "rebalance";

export interface VariantArguments {
    readonly name: string;
    readonly mode: Modes;
    readonly algorithm: Algorithm;
    readonly source?: string;
    readonly activate: boolean;
    readonly releasesDir: string;
}

export interface CalculatorSources {
    readonly files: {
        readonly base: string;
        readonly calculator: string;
        readonly replayAnalyzer: string;
        readonly strainGraph: string;
    };
    readonly aliases: Record<string, string>;
}

const processorDirectory = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Resolves symlinks in a path that may not exist yet, by resolving its nearest existing ancestor and re-appending
 * the rest.
 */
function realPathOfNearestAncestor(path: string): string {
    const missing: string[] = [];
    let current = resolve(path);

    for (;;) {
        try {
            return join(realpathSync(current), ...missing.reverse());
        } catch (e) {
            const parent = dirname(current);

            if (
                !(e instanceof Error && "code" in e && e.code === "ENOENT") ||
                parent === current
            ) {
                throw e;
            }

            missing.push(current.slice(parent.length + 1));
            current = parent;
        }
    }
}

/**
 * Whether a directory resolves to a place strictly inside apps/processor. Node resolves modules from real paths,
 * so symlinks are followed before checking.
 */
function isInsideProcessor(directory: string): boolean {
    const fromProcessor = relative(
        realpathSync(processorDirectory),
        realPathOfNearestAncestor(directory),
    );

    return (
        fromProcessor !== "" &&
        fromProcessor !== ".." &&
        !fromProcessor.startsWith(`..${sep}`) &&
        !isAbsolute(fromProcessor)
    );
}

const modes: readonly string[] = Object.values(Modes);

const usage = `Usage: build:variant <name> --mode ${modes.join("|")} --algorithm live|rebalance [--source <osu-droid-module path>] [--activate] [--releases-dir <dir>]`;

function isMode(value: string | undefined): value is Modes {
    return value !== undefined && modes.includes(value);
}

function isAlgorithm(value: string | undefined): value is Algorithm {
    return value === "live" || value === "rebalance";
}

/**
 * Parses build:variant arguments.
 *
 * @throws {Error} With the usage text if an argument is missing or invalid.
 */
export function parseArguments(argv: string[]): VariantArguments {
    const fail = (problem: string): never => {
        throw new Error(`${problem}\n${usage}`);
    };

    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            mode: { type: "string" },
            algorithm: { type: "string" },
            source: { type: "string" },
            activate: { type: "boolean", default: false },
            "releases-dir": { type: "string", default: "releases" },
        },
    });

    const name = positionals[0] ?? "";

    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        fail("The variant name must match ^[a-z0-9][a-z0-9-]*$.");
    }

    const { mode, algorithm } = values;

    if (!isMode(mode)) {
        return fail(`--mode must be one of ${modes.join(", ")}.`);
    }

    if (!isAlgorithm(algorithm)) {
        return fail("--algorithm must be live or rebalance.");
    }

    // Snapshots keep `piscina` and `canvas` external and resolve them from apps/processor/node_modules.
    const releasesDir = values["releases-dir"];

    if (!isInsideProcessor(releasesDir)) {
        fail(
            `--releases-dir must be inside ${processorDirectory}, because snapshots resolve piscina and canvas from its node_modules.`,
        );
    }

    return {
        name,
        mode,
        algorithm,
        ...(values.source !== undefined && { source: resolve(values.source) }),
        activate: values.activate,
        releasesDir,
    };
}

/**
 * Finds the entry files of the osu packages to bundle, from npm or a built osu-droid-module checkout.
 *
 * @throws {Error} If a package in the checkout has not been built.
 */
export function resolveCalculatorSources(
    algorithm: Algorithm,
    source?: string,
): CalculatorSources {
    const directories = {
        base: "osu-base",
        calculator:
            algorithm === "live"
                ? "osu-difficulty-calculator"
                : "osu-rebalance-difficulty-calculator",
        replayAnalyzer: "osu-droid-replay-analyzer",
        strainGraph: "osu-strain-graph-generator",
    };

    let resolveEntry: (directory: string) => string;

    if (source) {
        resolveEntry = (directory) => {
            const file = join(
                source,
                "packages",
                directory,
                "dist",
                "index.js",
            );

            if (!existsSync(file)) {
                throw new Error(
                    `Missing ${file}; build osu-droid-module first`,
                );
            }

            return file;
        };
    } else {
        const require = createRequire(import.meta.url);

        resolveEntry = (directory) => require.resolve(`@rian8337/${directory}`);
    }

    const files = {
        base: resolveEntry(directories.base),
        calculator: resolveEntry(directories.calculator),
        replayAnalyzer: resolveEntry(directories.replayAnalyzer),
        strainGraph: resolveEntry(directories.strainGraph),
    };

    return {
        files,
        aliases: {
            "@rian8337/osu-base": files.base,
            "@rian8337/osu-difficulty-calculator": files.calculator,
            "@rian8337/osu-droid-replay-analyzer": files.replayAnalyzer,
            "@rian8337/osu-strain-graph-generator": files.strainGraph,
        },
    };
}

/**
 * Formats a snapshot folder name: `YYYYMMDD-HHMMSS` in UTC.
 */
export function createSnapshotName(date: Date): string {
    return date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
}

/**
 * Creates a new, empty snapshot directory. Never reuses an existing one.
 *
 * @returns The created directory.
 */
export async function createSnapshotDirectory(
    variantDir: string,
    date: Date,
): Promise<string> {
    const base = createSnapshotName(date);

    await mkdir(variantDir, { recursive: true });

    for (let attempt = 1; ; attempt++) {
        const directory = join(
            variantDir,
            attempt === 1 ? base : `${base}-${attempt.toString()}`,
        );

        try {
            await mkdir(directory);

            return directory;
        } catch (e) {
            if (!(e instanceof Error && "code" in e && e.code === "EEXIST")) {
                throw e;
            }
        }
    }
}

/**
 * Writes `manifest.json` into a snapshot.
 */
export async function writeManifest(
    snapshotDir: string,
    manifest: object,
): Promise<void> {
    await writeFile(
        join(snapshotDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
}

/**
 * Atomically points `<variantDir>/current` at a snapshot, using a relative symlink.
 */
export async function activateSnapshot(
    variantDir: string,
    snapshotName: string,
): Promise<void> {
    const temporary = join(variantDir, ".current-next");

    await rm(temporary, { force: true });
    await symlink(snapshotName, temporary);
    await rename(temporary, join(variantDir, "current"));
}
