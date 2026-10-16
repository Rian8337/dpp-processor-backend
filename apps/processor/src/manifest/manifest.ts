import { EnvironmentVariableKey } from "@/types/env";
import type { CalculatorAlgorithm } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";
import { computeCalculatorVersion } from "./calculatorVersion";

/**
 * Identifies the variant a process is running. Written by the build into each snapshot.
 */
export interface VariantManifest {
    readonly id: string;
    readonly mode: Modes;
    readonly algorithm: CalculatorAlgorithm;
    readonly calculatorVersion: string;

    /**
     * `"npm"`, or the path of the osu-droid-module checkout the snapshot was built from.
     */
    readonly source: string;
    readonly builtAt: string;
}

const manifestSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    mode: z.enum(Modes),
    algorithm: z.enum(["live", "rebalance"]),
    calculatorVersion: z.string().regex(/^[0-9a-f]{16}$/),
    source: z.string().min(1),
    builtAt: z.iso.datetime(),
}) satisfies z.ZodType<VariantManifest>;

/**
 * Loads the variant manifest.
 *
 * When `manifestFile` does not exist (running from source), a development manifest is built from the `DEV_MODE`
 * environment variable and the installed live calculator.
 */
export async function loadManifest(
    manifestFile: URL,
    env: NodeJS.ProcessEnv,
): Promise<VariantManifest> {
    let content: string | null;

    try {
        content = await readFile(manifestFile, "utf8");
    } catch {
        content = null;
    }

    if (content !== null) {
        const result = manifestSchema.safeParse(JSON.parse(content));

        if (!result.success) {
            throw new Error(
                `Invalid manifest.json: ${result.error.issues[0]?.message ?? "unknown error"}`,
            );
        }

        return result.data;
    }

    const mode = z.enum(Modes).safeParse(env[EnvironmentVariableKey.DevMode]);

    if (!mode.success) {
        throw new Error(
            `No manifest.json found; set DEV_MODE to one of ${Object.values(Modes).join(", ")} to run from source`,
        );
    }

    const require = createRequire(import.meta.url);

    return {
        id: `dev-${mode.data}`,
        mode: mode.data,
        algorithm: "live",
        calculatorVersion: await computeCalculatorVersion([
            require.resolve("@rian8337/osu-difficulty-calculator"),
            require.resolve("@rian8337/osu-base"),
        ]),
        source: "npm",
        builtAt: new Date().toISOString(),
    };
}
