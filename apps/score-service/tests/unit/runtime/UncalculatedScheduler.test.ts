import { UncalculatedScheduler } from "@/runtime/UncalculatedScheduler";
import type { IUncalculatedReplayService } from "@/services/IUncalculatedReplayService";
import { testConfig } from "@test/utils/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intervalMs = testConfig.uncalculatedIntervalMinutes * 60_000;

describe("UncalculatedScheduler", () => {
    let runPass: ReturnType<
        typeof vi.fn<IUncalculatedReplayService["runPass"]>
    >;
    let scheduler: UncalculatedScheduler;
    let log: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        runPass = vi.fn(() => Promise.resolve());
        scheduler = new UncalculatedScheduler(testConfig, {
            runPass,
            processFile: vi.fn(),
        });
    });

    afterEach(async () => {
        await scheduler[Symbol.asyncDispose]();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("runs a pass at once, then every interval", async () => {
        scheduler.start();
        expect(runPass).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(runPass).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(runPass).toHaveBeenCalledTimes(3);
    });

    it("skips an interval while a pass is still running", async () => {
        let finish!: () => void;

        runPass.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
        );
        scheduler.start();

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(runPass).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(
            "Previous uncalculated pass still running; skipping this one",
        );

        finish();
        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(runPass).toHaveBeenCalledTimes(2);
    });

    it("logs a failing pass and keeps the schedule", async () => {
        runPass.mockRejectedValueOnce(new Error("boom"));
        scheduler.start();

        await vi.advanceTimersByTimeAsync(intervalMs);

        expect(error).toHaveBeenCalledWith(
            "Uncalculated pass failed:",
            expect.any(Error),
        );
        expect(runPass).toHaveBeenCalledTimes(2);
    });

    it("aborts and awaits the running pass on dispose, and stops the interval", async () => {
        let signal: AbortSignal | undefined;
        let finish!: () => void;

        runPass.mockImplementationOnce((s) => {
            signal = s;
            return new Promise<void>((resolve) => {
                finish = resolve;
            });
        });
        scheduler.start();

        let disposed = false;
        const disposing = scheduler[Symbol.asyncDispose]().then(() => {
            disposed = true;
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(signal?.aborted).toBe(true);
        expect(disposed).toBe(false);

        finish();
        await disposing;
        expect(disposed).toBe(true);

        await vi.advanceTimersByTimeAsync(intervalMs * 2);
        expect(runPass).toHaveBeenCalledTimes(1);
    });
});
