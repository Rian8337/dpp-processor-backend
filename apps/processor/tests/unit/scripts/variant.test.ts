import { Modes } from "@rian8337/osu-base";
import {
    mkdir,
    mkdtempDisposable,
    readlink,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    activateSnapshot,
    createSnapshotDirectory,
    createSnapshotName,
    parseArguments,
    resolveCalculatorSources,
} from "../../../scripts/lib/variant.ts";

function createTemporaryDirectory() {
    return mkdtempDisposable(join(tmpdir(), "variant-"));
}

describe("parseArguments", () => {
    it("parses a full command line", () => {
        expect(
            parseArguments([
                "flowaim",
                "--mode",
                Modes.Droid,
                "--algorithm",
                "rebalance",
                "--source",
                "/src/odm",
                "--activate",
            ]),
        ).toEqual({
            name: "flowaim",
            mode: Modes.Droid,
            algorithm: "rebalance",
            source: "/src/odm",
            activate: true,
            releasesDir: "releases",
        });
    });

    it("accepts a releases directory inside apps/processor", () => {
        const inside = fileURLToPath(
            new URL("../../../releases/e2e-x", import.meta.url),
        );

        for (const dir of ["releases", "other/releases", "..foo", inside]) {
            expect(
                parseArguments([
                    "ok",
                    "--mode",
                    Modes.Droid,
                    "--algorithm",
                    "live",
                    "--releases-dir",
                    dir,
                ]).releasesDir,
            ).toBe(dir);
        }
    });

    it.each(["/tmp/releases", "../releases", "../../elsewhere", "."])(
        "rejects the releases directory %s, which is outside apps/processor",
        (dir) => {
            expect(() =>
                parseArguments([
                    "ok",
                    "--mode",
                    Modes.Droid,
                    "--algorithm",
                    "live",
                    "--releases-dir",
                    dir,
                ]),
            ).toThrow(/--releases-dir must be inside .*apps\/processor/);
        },
    );

    it("rejects a releases directory that is a symlink to outside apps/processor", async () => {
        await using outside = await createTemporaryDirectory();
        const processorDirectory = fileURLToPath(
            new URL("../../../", import.meta.url),
        );
        await using inside = await mkdtempDisposable(
            join(processorDirectory, ".variant-test-"),
        );
        const link = join(inside.path, "releases");

        await symlink(outside.path, link);

        for (const dir of [link, join(link, "not-yet-created")]) {
            expect(() =>
                parseArguments([
                    "ok",
                    "--mode",
                    Modes.Droid,
                    "--algorithm",
                    "live",
                    "--releases-dir",
                    dir,
                ]),
            ).toThrow(/--releases-dir must be inside/);
        }
    });

    it.each([
        [["Bad_Name", "--mode", Modes.Droid, "--algorithm", "live"]],
        [["ok", "--mode", "taiko", "--algorithm", "live"]],
        [["ok", "--mode", Modes.Droid, "--algorithm", "experimental"]],
        [["--mode", Modes.Droid, "--algorithm", "live"]],
    ])("rejects %j", (argv) => {
        expect(() => parseArguments(argv)).toThrow(/Usage/);
    });
});

describe("createSnapshotName", () => {
    it("formats the UTC time", () => {
        expect(createSnapshotName(new Date("2026-10-05T14:30:07.123Z"))).toBe(
            "20261005-143007",
        );
    });
});

describe("filesystem helpers", () => {
    it("never reuses an existing snapshot directory", async () => {
        await using directory = await createTemporaryDirectory();
        const date = new Date("2026-10-05T14:30:07Z");

        expect(await createSnapshotDirectory(directory.path, date)).toBe(
            join(directory.path, "20261005-143007"),
        );
        expect(await createSnapshotDirectory(directory.path, date)).toBe(
            join(directory.path, "20261005-143007-2"),
        );
    });

    it("points current at the activated snapshot with a relative link, replacing the previous one", async () => {
        await using directory = await createTemporaryDirectory();

        await mkdir(join(directory.path, "a"));
        await mkdir(join(directory.path, "b"));

        await activateSnapshot(directory.path, "a");
        expect(await readlink(join(directory.path, "current"))).toBe("a");

        await activateSnapshot(directory.path, "b");
        expect(await readlink(join(directory.path, "current"))).toBe("b");
    });

    it("resolves a local osu-droid-module checkout and requires built packages", async () => {
        await using directory = await createTemporaryDirectory();

        expect(() =>
            resolveCalculatorSources("rebalance", directory.path),
        ).toThrow(/build osu-droid-module/);

        for (const pkg of [
            "osu-base",
            "osu-rebalance-difficulty-calculator",
            "osu-droid-replay-analyzer",
            "osu-strain-graph-generator",
        ]) {
            await mkdir(join(directory.path, "packages", pkg, "dist"), {
                recursive: true,
            });
            await writeFile(
                join(directory.path, "packages", pkg, "dist", "index.js"),
                "",
            );
        }

        const sources = resolveCalculatorSources("rebalance", directory.path);

        expect(sources.files.calculator).toBe(
            join(
                directory.path,
                "packages",
                "osu-rebalance-difficulty-calculator",
                "dist",
                "index.js",
            ),
        );
        expect(sources.aliases["@rian8337/osu-difficulty-calculator"]).toBe(
            sources.files.calculator,
        );
        expect(sources.aliases["@rian8337/osu-base"]).toBe(sources.files.base);
    });
});

describe("resolveCalculatorSources from npm", () => {
    it("picks the live or rebalance package", () => {
        expect(resolveCalculatorSources("live").files.calculator).toMatch(
            /osu-difficulty-calculator/,
        );
        expect(resolveCalculatorSources("rebalance").files.calculator).toMatch(
            /osu-rebalance-difficulty-calculator/,
        );
    });
});
