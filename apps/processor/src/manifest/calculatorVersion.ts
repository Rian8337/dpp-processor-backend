import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Computes the calculator version: the first 16 hex characters of SHA-256 over the given files, in order.
 *
 * Pass the calculator entry file followed by the osu-base entry file.
 */
export async function computeCalculatorVersion(
    files: readonly string[],
): Promise<string> {
    const hash = createHash("sha256");

    for (const file of files) {
        hash.update(await readFile(file));
    }

    return hash.digest("hex").slice(0, 16);
}
