import { ReplayStore } from "@/replays/ReplayStore";
import { testConfig } from "@test/utils/config";
import {
    chmod,
    mkdir,
    mkdtempDisposable,
    readFile,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Tests run as root, which may change any file's mode, so a failure has to be scripted.
vi.mock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs/promises")>();

    return { ...actual, chmod: vi.fn(actual.chmod) };
});

function errorWithCode(code: string): Error {
    return Object.assign(new Error(`${code}: scripted`), { code });
}

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
    afterEach(() => {
        vi.restoreAllMocks();
    });

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

    it("does not change the mode of a best replay that is already readable by everyone", () =>
        withStore(async (store, dirs) => {
            const path = join(dirs.best, "5.odr");

            await store.writeBestReplay(5, Buffer.from("one"));
            vi.mocked(chmod).mockClear();
            await store.writeBestReplay(5, Buffer.from("two"));

            expect(chmod).not.toHaveBeenCalled();
            expect((await readFile(path)).toString()).toBe("two");
        }));

    it("keeps a best replay of another user that it cannot change the mode of", () =>
        withStore(async (store, dirs) => {
            const path = join(dirs.best, "5.odr");
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            await writeFile(path, "one");
            await chmod(path, 0o666);
            vi.mocked(chmod).mockRejectedValueOnce(errorWithCode("EPERM"));

            await expect(
                store.writeBestReplay(5, Buffer.from("two")),
            ).resolves.toBeUndefined();

            expect((await readFile(path)).toString()).toBe("two");
            expect(warn).toHaveBeenCalledOnce();
            expect(String(warn.mock.calls[0]?.[0])).toContain(path);
        }));

    it("still fails when the mode of a best replay cannot be changed for another reason", () =>
        withStore(async (store, dirs) => {
            await writeFile(join(dirs.best, "5.odr"), "one");
            await chmod(join(dirs.best, "5.odr"), 0o666);
            vi.mocked(chmod).mockRejectedValueOnce(errorWithCode("EIO"));

            await expect(
                store.writeBestReplay(5, Buffer.from("two")),
            ).rejects.toMatchObject({ code: "EIO" });
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
