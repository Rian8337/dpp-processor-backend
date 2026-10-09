import { UsageStats } from "@/services/UsageStats";
import { testConfig } from "@test/utils/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = { ...testConfig, usageSummaryIntervalSeconds: 300 };

describe("UsageStats", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("has nothing to report before any request", () => {
        expect(new UsageStats(enabled).takeSummary()).toEqual([]);
    });

    it("summarizes per variant and per caller, then resets", () => {
        const stats = new UsageStats(enabled);

        for (let ms = 1; ms <= 100; ms++) {
            stats.record({
                variant: "droid-live",
                caller: ms % 2 === 0 ? "bot" : "anonymous",
                status: ms <= 90 ? 200 : ms <= 98 ? 404 : 500,
                durationMs: ms + 0.4,
            });
        }

        stats.record({
            variant: null,
            caller: "anonymous",
            status: 429,
            durationMs: 1,
        });
        stats.recordRateLimited("anonymous");
        vi.setSystemTime(new Date("2026-10-07T00:05:00Z"));

        expect(stats.takeSummary()).toEqual([
            "Usage over 300 s: variant droid-live: 100 requests (2xx 90, 4xx 8, 5xx 2), p50 50 ms, p95 95 ms",
            "Usage over 300 s: caller anonymous: 51 requests, 1 rate-limited",
            "Usage over 300 s: caller bot: 50 requests, 0 rate-limited",
        ]);
        expect(stats.takeSummary()).toEqual([]);
    });

    it("logs a summary on each interval and a final one when disposed", () => {
        const log = vi
            .spyOn(console, "log")
            .mockImplementation(() => undefined);
        const stats = new UsageStats(enabled);
        const timer = stats.start();

        stats.record({
            variant: "droid-live",
            caller: "bot",
            status: 200,
            durationMs: 5,
        });
        vi.advanceTimersByTime(300_000);

        expect(log).toHaveBeenCalledTimes(2);

        stats.record({
            variant: "droid-live",
            caller: "bot",
            status: 200,
            durationMs: 5,
        });
        timer[Symbol.dispose]();

        expect(log).toHaveBeenCalledTimes(4);

        vi.advanceTimersByTime(600_000);

        expect(log).toHaveBeenCalledTimes(4);
    });

    it("logs nothing when summaries are disabled", () => {
        const log = vi
            .spyOn(console, "log")
            .mockImplementation(() => undefined);
        const stats = new UsageStats(testConfig);
        const timer = stats.start();

        stats.record({
            variant: "droid-live",
            caller: "bot",
            status: 200,
            durationMs: 5,
        });
        vi.advanceTimersByTime(600_000);
        timer[Symbol.dispose]();

        expect(log).not.toHaveBeenCalled();
    });
});
