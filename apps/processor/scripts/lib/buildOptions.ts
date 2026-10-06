import { cp } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import type { UserConfig } from "tsdown";

/**
 * Packages left out of bundles: native addons, and piscina, which spawns its own worker script from its package
 * directory.
 */
export const externalPackages = ["canvas", "piscina", "pg-native"];

function isExternal(id: string): boolean {
    return (
        id.startsWith("node:") ||
        builtinModules.includes(id) ||
        externalPackages.some(
            (name) => id === name || id.startsWith(`${name}/`),
        )
    );
}

/**
 * tsdown options for the processor. Everything except Node built-ins and {@link externalPackages} is bundled, so
 * a build does not depend on which osu packages are installed after it was made.
 *
 * Paths are relative to `apps/processor`.
 *
 * @param options.outDir The output directory.
 * @param options.alias Module redirections, used to pick the calculator source.
 */
export function createBuildOptions(options: {
    outDir: string;
    alias?: Record<string, string>;
}): UserConfig {
    return {
        // `src/polyfills.ts` must be the first import of `index.ts` and `prune.ts`: the bundler evaluates
        // reflect-metadata lazily, so a later import lets tsyringe load before the Reflect polyfill exists.
        entry: {
            index: "src/index.ts",
            worker: "src/calculation/worker.ts",
            prune: "src/cli/prune.ts",
        },
        format: "esm",
        platform: "node",
        tsconfig: "tsconfig.build.json",
        outDir: options.outDir,
        clean: true,
        alias: options.alias,
        deps: {
            neverBundle: externalPackages,
            alwaysBundle: (id) => !isExternal(id),
            onlyBundle: false,
        },
        onSuccess: async () => {
            await cp("drizzle", join(options.outDir, "drizzle"), {
                recursive: true,
            });
        },
    };
}
