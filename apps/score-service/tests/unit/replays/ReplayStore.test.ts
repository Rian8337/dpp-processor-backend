import { ReplayStore } from "@/replays/ReplayStore";
import { testConfig } from "@test/utils/config";
import {
    mkdir,
    mkdtempDisposable,
    readFile,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function withStore(
    run: (
        store: ReplayStore,
        dirs: Record<
            "unprocessed" | "online" | "best" | "uncalculated",
            string
        >,
    ) => Promise<void>,
) {
    await using root = await mkdtempDisposable(join(tmpdir(), "replays-"));
    const dirs = {
        unprocessed: join(root.path, "unprocessed"),
        online: join(root.path, "online"),
        best: join(root.path, "best"),
        uncalculated: join(root.path, "uncalculated"),
    };

    await Promise.all(Object.values(dirs).map((d) => mkdir(d)));
    await run(
        new ReplayStore({ ...testConfig, replayDirectories: dirs }),
        dirs,
    );
}

describe("ReplayStore", () => {
    it("reads contents, and null for a missing file", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.unprocessed, "a.odr"), "abc");

            expect(await store.read("unprocessed", "a.odr")).toEqual(
                Buffer.from("abc"),
            );
            expect(await store.read("unprocessed", "b.odr")).toBeNull();
        }));

    it("gives the modification time, and null for a missing file", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.uncalculated, "a.odr"), "abc");

            const modified = await store.modifiedAt("uncalculated", "a.odr");

            expect(modified).toEqual(
                (await stat(join(dirs.uncalculated, "a.odr"))).mtime,
            );
            expect(await store.modifiedAt("uncalculated", "b.odr")).toBeNull();
        }));

    it("reads score replays from the online and best folders", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.online, "5.odr"), "online");
            await writeFile(join(dirs.best, "5.odr"), "best");

            expect((await store.readScoreReplay("online", 5))?.toString()).toBe(
                "online",
            );
            expect((await store.readScoreReplay("best", 5))?.toString()).toBe(
                "best",
            );
        }));

    it("writes a best replay readable by everyone, overwriting", () =>
        withStore(async (store, dirs) => {
            const path = join(dirs.best, "5.odr");

            await store.writeBestReplay(5, Buffer.from("one"));
            await store.writeBestReplay(5, Buffer.from("two"));

            expect((await stat(path)).mode & 0o777).toBe(0o777);
            expect((await readFile(path)).toString()).toBe("two");
        }));

    it("deleting a missing best replay resolves", () =>
        withStore(async (store) => {
            await expect(store.deleteBestReplay(6)).resolves.toBeUndefined();
        }));

    it("lists file names only", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.uncalculated, "a.odr"), "x");
            await mkdir(join(dirs.uncalculated, "sub"));

            expect(await store.list("uncalculated")).toEqual(["a.odr"]);
        }));

    it("deletes a file, and deleting again resolves", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.unprocessed, "a.odr"), "x");

            await store.delete("unprocessed", "a.odr");
            await expect(
                store.delete("unprocessed", "a.odr"),
            ).resolves.toBeUndefined();
            expect(await store.read("unprocessed", "a.odr")).toBeNull();
        }));

    it.each(["../online/5.odr", "a/b.odr"])(
        "rejects the file name %s",
        (name) =>
            withStore(async (store) => {
                await expect(store.read("unprocessed", name)).rejects.toThrow(
                    `Invalid replay file name: ${name}`,
                );
            }),
    );
});
