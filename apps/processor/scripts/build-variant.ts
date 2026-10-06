import { basename, join } from "node:path";
import { build } from "tsdown";
import { computeCalculatorVersion } from "../src/manifest/calculatorVersion.ts";
import { createBuildOptions } from "./lib/buildOptions.ts";
import {
    activateSnapshot,
    createSnapshotDirectory,
    parseArguments,
    resolveCalculatorSources,
    writeManifest,
} from "./lib/variant.ts";

/**
 * Builds an immutable variant snapshot into `releases/<name>/<timestamp>/`.
 */
async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const sources = resolveCalculatorSources(args.algorithm, args.source);
    const builtAt = new Date();
    const variantDir = join(args.releasesDir, args.name);
    const snapshotDir = await createSnapshotDirectory(variantDir, builtAt);

    await build({
        ...createBuildOptions({ outDir: snapshotDir, alias: sources.aliases }),
        config: false,
        logLevel: "warn",
    });

    await writeManifest(snapshotDir, {
        id: args.name,
        mode: args.mode,
        algorithm: args.algorithm,
        calculatorVersion: await computeCalculatorVersion([
            sources.files.calculator,
            sources.files.base,
        ]),
        source: args.source ?? "npm",
        builtAt: builtAt.toISOString(),
    });

    if (args.activate) {
        await activateSnapshot(variantDir, basename(snapshotDir));
    }

    console.log(
        `Built ${args.name} into ${snapshotDir}${args.activate ? " and activated it" : ""}`,
    );
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
