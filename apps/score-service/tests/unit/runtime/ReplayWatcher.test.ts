import type { Config } from "@/config/config";
import { ReplayStore } from "@/replays/ReplayStore";
import { ReplayWatcher } from "@/runtime/ReplayWatcher";
import type {
    IReplaySubmissionService,
    SubmissionResult,
} from "@/services/IReplaySubmissionService";
import { testConfig } from "@test/utils/config";
import { mkdir, mkdtempDisposable, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const processed: SubmissionResult = { action: "delete", reason: "processed" };
const detectionTimeout = { timeout: 10_000 };

async function setup(
    run: (context: {
        watcher: ReplayWatcher;
        dir: string;
        process: ReturnType<typeof vi.fn<IReplaySubmissionService["process"]>>;
        exists: (fileName: string) => Promise<boolean>;
    }) => Promise<void>,
    options: { concurrency?: number } = {},
) {
    await using root = await mkdtempDisposable(join(tmpdir(), "watcher-"));
    const dir = join(root.path, "unprocessed");

    await mkdir(dir);

    const config: Config = {
        ...testConfig,
        replayConcurrency: options.concurrency ?? testConfig.replayConcurrency,
        replayDirectories: {
            ...testConfig.replayDirectories,
            unprocessed: dir,
        },
    };
    const process = vi
        .fn<IReplaySubmissionService["process"]>()
        .mockResolvedValue(processed);
    await using watcher = new ReplayWatcher(config, new ReplayStore(config), {
        process,
    });

    await run({
        watcher,
        dir,
        process,
        exists: async (fileName) =>
            (await new ReplayStore(config).read("unprocessed", fileName)) !==
            null,
    });
}

function callsFor(process: { mock: { calls: unknown[][] } }, fileName: string) {
    return process.mock.calls.filter(([name]) => name === fileName);
}

describe("ReplayWatcher", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("handle", () => {
        it("deletes files that are not replays without calling the service", async () => {
            await setup(async ({ watcher, dir, process, exists }) => {
                await writeFile(join(dir, "a.txt"), "x");
                await watcher.handle("a.txt");

                expect(process).not.toHaveBeenCalled();
                expect(await exists("a.txt")).toBe(false);
            });
        });

        it("deletes a processed replay and logs it", async () => {
            const log = vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process, exists }) => {
                await writeFile(join(dir, "1_x.odr"), "contents");
                await watcher.handle("1_x.odr");

                expect(process).toHaveBeenCalledWith(
                    "1_x.odr",
                    Buffer.from("contents"),
                );
                expect(await exists("1_x.odr")).toBe(false);
                expect(log).toHaveBeenCalledWith(
                    "Processed replay 1_x.odr: processed",
                );
            });
        });

        it("retries a kept file with backoff and resets after success", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process, exists }) => {
                vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
                process.mockResolvedValue({ action: "keep", reason: "later" });
                await writeFile(join(dir, "1_x.odr"), "c");
                await watcher.handle("1_x.odr");
                expect(process).toHaveBeenCalledTimes(1);

                await vi.advanceTimersByTimeAsync(29_999);
                expect(process).toHaveBeenCalledTimes(1);
                await vi.advanceTimersByTimeAsync(1);
                await vi.waitFor(() =>
                    expect(process).toHaveBeenCalledTimes(2),
                );

                await vi.advanceTimersByTimeAsync(59_999);
                expect(process).toHaveBeenCalledTimes(2);
                await vi.advanceTimersByTimeAsync(1);
                await vi.waitFor(() =>
                    expect(process).toHaveBeenCalledTimes(3),
                );

                process.mockResolvedValue(processed);
                await vi.advanceTimersByTimeAsync(120_000);
                await vi.waitFor(() =>
                    expect(process).toHaveBeenCalledTimes(4),
                );
                await vi.waitFor(async () =>
                    expect(await exists("1_x.odr")).toBe(false),
                );

                await vi.advanceTimersByTimeAsync(20 * 60_000);
                expect(process).toHaveBeenCalledTimes(4);

                // The attempt count was reset: a new keep waits the base delay again.
                process.mockResolvedValue({ action: "keep", reason: "later" });
                await writeFile(join(dir, "1_x.odr"), "c");
                await watcher.handle("1_x.odr");
                await vi.advanceTimersByTimeAsync(30_000);
                await vi.waitFor(() =>
                    expect(process).toHaveBeenCalledTimes(6),
                );
            });
        });

        it("waits for the larger of backoff and retryAfterMs, capped at ten minutes", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process }) => {
                vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
                process.mockResolvedValueOnce({
                    action: "keep",
                    reason: "later",
                    retryAfterMs: 120_000,
                });
                await writeFile(join(dir, "1_x.odr"), "c");
                await watcher.handle("1_x.odr");

                await vi.advanceTimersByTimeAsync(119_999);
                expect(process).toHaveBeenCalledTimes(1);
                await vi.advanceTimersByTimeAsync(1);
                await vi.waitFor(() =>
                    expect(process).toHaveBeenCalledTimes(2),
                );

                process.mockResolvedValueOnce({
                    action: "keep",
                    reason: "later",
                    retryAfterMs: 3_600_000,
                });
                await writeFile(join(dir, "2_x.odr"), "c");
                await watcher.handle("2_x.odr");
                await vi.advanceTimersByTimeAsync(600_000);
                await vi.waitFor(() =>
                    expect(callsFor(process, "2_x.odr")).toHaveLength(2),
                );
            });
        });

        it("ignores a file that disappeared", async () => {
            await setup(async ({ watcher, process }) => {
                await expect(
                    watcher.handle("gone.odr"),
                ).resolves.toBeUndefined();
                expect(process).not.toHaveBeenCalled();
            });
        });
    });

    describe("start", () => {
        it("processes the backlog and new files exactly once each", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process }) => {
                await writeFile(join(dir, "1_old.odr"), "old");
                await watcher.start();
                await writeFile(join(dir, "2_new.odr"), "new");

                await vi.waitFor(() => {
                    expect(callsFor(process, "1_old.odr")).toHaveLength(1);
                    expect(callsFor(process, "2_new.odr")).toHaveLength(1);
                }, detectionTimeout);

                await new Promise((r) => setTimeout(r, 1_500));
                expect(process).toHaveBeenCalledTimes(2);
            });
        }, 20_000);

        it("processes a file written in two parts once, with full contents", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process }) => {
                await watcher.start();

                const handle = await open(join(dir, "3_split.odr"), "w");

                await handle.write("first-");
                await new Promise((r) => setTimeout(r, 500));
                await handle.write("second");
                await handle.close();

                await vi.waitFor(
                    () => expect(process).toHaveBeenCalled(),
                    detectionTimeout,
                );
                await new Promise((r) => setTimeout(r, 1_500));

                expect(process).toHaveBeenCalledTimes(1);
                expect(process).toHaveBeenCalledWith(
                    "3_split.odr",
                    Buffer.from("first-second"),
                );
            });
        }, 20_000);

        it("stops watching, cancels retries, and waits for a running call on disposal", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(async ({ watcher, dir, process }) => {
                let release!: () => void;
                let finished = false;

                process.mockImplementationOnce(async () => {
                    await new Promise<void>((r) => (release = r));
                    finished = true;

                    return { action: "keep", reason: "later" };
                });
                await writeFile(join(dir, "1_x.odr"), "c");
                await watcher.start();
                await vi.waitFor(
                    () => expect(process).toHaveBeenCalledTimes(1),
                    detectionTimeout,
                );

                const disposing = watcher[Symbol.asyncDispose]();

                await new Promise((r) => setTimeout(r, 50));
                expect(finished).toBe(false);
                release();
                await disposing;
                expect(finished).toBe(true);

                await writeFile(join(dir, "2_late.odr"), "c");
                await new Promise((r) => setTimeout(r, 3_000));
                expect(process).toHaveBeenCalledTimes(1);
            });
        }, 20_000);

        it("never runs more than the configured number of calls at once", async () => {
            vi.spyOn(console, "log").mockImplementation(() => {});

            await setup(
                async ({ watcher, dir, process }) => {
                    const releases: (() => void)[] = [];
                    let running = 0;
                    let max = 0;

                    process.mockImplementation(async () => {
                        running++;
                        max = Math.max(max, running);
                        await new Promise<void>((r) => releases.push(r));
                        running--;

                        return processed;
                    });

                    for (let i = 0; i < 5; i++) {
                        await writeFile(
                            join(dir, `${i.toString()}_x.odr`),
                            "c",
                        );
                    }

                    await watcher.start();
                    await vi.waitFor(() => expect(running).toBe(2));
                    await new Promise((r) => setTimeout(r, 200));
                    expect(max).toBe(2);

                    while (process.mock.calls.length < 5 || running > 0) {
                        releases.splice(0).forEach((release) => release());
                        await new Promise((r) => setTimeout(r, 10));
                    }

                    expect(max).toBe(2);
                },
                { concurrency: 2 },
            );
        }, 20_000);
    });
});
