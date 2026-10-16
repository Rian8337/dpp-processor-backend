import { computeCalculatorVersion } from "@/manifest/calculatorVersion";
import { loadManifest } from "@/manifest/manifest";
import { Modes } from "@rian8337/osu-base";
import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function createTemporaryDirectory() {
    return mkdtempDisposable(join(tmpdir(), "manifest-"));
}

describe("computeCalculatorVersion", () => {
    it("is 16 hex characters and changes when any file changes", async () => {
        await using directory = await createTemporaryDirectory();
        const a = join(directory.path, "a.js");
        const b = join(directory.path, "b.js");

        await writeFile(a, "calculator");
        await writeFile(b, "base");
        const first = await computeCalculatorVersion([a, b]);

        expect(first).toMatch(/^[0-9a-f]{16}$/);
        expect(await computeCalculatorVersion([a, b])).toBe(first);

        await writeFile(b, "base changed");
        expect(await computeCalculatorVersion([a, b])).not.toBe(first);
    });
});

describe("loadManifest", () => {
    it("reads manifest.json when it exists", async () => {
        await using directory = await createTemporaryDirectory();
        const manifest = {
            id: "flowaim-experiment",
            mode: Modes.Droid,
            algorithm: "rebalance",
            calculatorVersion: "0123456789abcdef",
            source: "/home/rian/osu-droid-module-flowaim",
            builtAt: "2026-10-05T14:30:00.000Z",
        };

        await writeFile(
            join(directory.path, "manifest.json"),
            JSON.stringify(manifest),
        );

        expect(
            await loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).toEqual(manifest);
    });

    it("rejects an invalid manifest.json", async () => {
        await using directory = await createTemporaryDirectory();

        await writeFile(
            join(directory.path, "manifest.json"),
            JSON.stringify({ id: "x" }),
        );

        await expect(
            loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).rejects.toThrow(/manifest/i);
    });

    it("builds a development manifest from DEV_MODE when there is no manifest.json", async () => {
        await using directory = await createTemporaryDirectory();
        const manifest = await loadManifest(
            pathToFileURL(join(directory.path, "manifest.json")),
            {
                DEV_MODE: Modes.Osu,
            },
        );

        expect(manifest).toMatchObject({
            id: `dev-${Modes.Osu}`,
            mode: Modes.Osu,
            algorithm: "live",
            source: "npm",
        });
        expect(manifest.calculatorVersion).toMatch(/^[0-9a-f]{16}$/);
    });

    it("requires DEV_MODE when there is no manifest.json", async () => {
        await using directory = await createTemporaryDirectory();

        await expect(
            loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).rejects.toThrow(/DEV_MODE/);
    });
});
