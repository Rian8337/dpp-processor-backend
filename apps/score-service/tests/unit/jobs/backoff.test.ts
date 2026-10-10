import { backoffDelay, sleep } from "@/jobs/backoff";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("backoffDelay", () => {
    it.each([
        [0, 30_000],
        [1, 60_000],
        [4, 480_000],
        [5, 600_000],
        [50, 600_000],
    ])("attempt %i waits %i ms", (attempt, expected) => {
        expect(backoffDelay(attempt, 30_000, 600_000)).toBe(expected);
    });
});

describe("sleep", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves immediately for an aborted signal", async () => {
        await expect(
            sleep(10_000, AbortSignal.abort()),
        ).resolves.toBeUndefined();
    });

    it("resolves early when aborted midway", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        const done = vi.fn();
        const promise = sleep(10_000, controller.signal).then(done);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(done).not.toHaveBeenCalled();

        controller.abort();
        await promise;
        expect(done).toHaveBeenCalled();
    });

    it("resolves after the delay", async () => {
        const start = performance.now();

        await sleep(50);
        expect(performance.now() - start).toBeGreaterThanOrEqual(40);
    });
});
