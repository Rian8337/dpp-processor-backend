import type { InfoResult, IProcessorClient } from "@/clients/IProcessorClient";
import type { Instance } from "@/registry/types";
import { HealthMonitor } from "@/services/HealthMonitor";
import { testConfig } from "@test/utils/config";
import { testInfo, testSnapshot } from "@test/utils/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const a1: Instance = { variantName: "a", url: "http://127.0.0.1:1001" };
const a2: Instance = { variantName: "a", url: "http://127.0.0.1:1002" };
const b1: Instance = { variantName: "b", url: "http://127.0.0.1:2001" };

const snapshot = testSnapshot({
    variants: [
        { name: "a", public: true, description: null },
        { name: "b", public: true, description: null },
    ],
    instances: [a1, a2, b1],
});

describe("HealthMonitor", () => {
    // What each URL answers; a missing URL is down.
    let answers: Map<string, InfoResult>;
    let getInfo: ReturnType<typeof vi.fn<IProcessorClient["getInfo"]>>;
    let monitor: HealthMonitor;

    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        answers = new Map([
            [a1.url, { kind: "ok", info: testInfo("a") }],
            [a2.url, { kind: "ok", info: testInfo("someone-else") }],
        ]);
        getInfo = vi.fn<IProcessorClient["getInfo"]>((url) =>
            Promise.resolve(
                answers.get(url) ?? {
                    kind: "failed",
                    reason: "connect ECONNREFUSED",
                },
            ),
        );
        monitor = new HealthMonitor(
            { getInfo, forward: vi.fn<IProcessorClient["forward"]>() },
            testConfig,
        );
        monitor.sync(snapshot);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("treats unchecked instances as down", () => {
        expect(monitor.stateOf(a1)).toBe("down");
        expect(monitor.isHealthy(a1)).toBe(false);
    });

    it("classifies instances after a check, using the health check timeout", async () => {
        await monitor.checkAll();

        expect(monitor.stateOf(a1)).toBe("healthy");
        expect(monitor.stateOf(a2)).toBe("mismatch");
        expect(monitor.isHealthy(a2)).toBe(false);
        expect(monitor.stateOf(b1)).toBe("down");
        expect(getInfo).toHaveBeenCalledWith(
            a1.url,
            testConfig.healthCheck.timeoutSeconds * 1000,
        );
    });

    it("keeps the variant's last /info, but never from a mismatched instance", async () => {
        await monitor.checkAll();

        expect(monitor.lastInfo("a")).toEqual(testInfo("a"));
        expect(monitor.lastInfo("b")).toBeUndefined();

        answers.delete(a1.url);
        await monitor.checkAll();

        expect(monitor.stateOf(a1)).toBe("down");
        expect(monitor.lastInfo("a")).toEqual(testInfo("a"));
    });

    it("makes a processor that starts after the broker available at the next check", async () => {
        await monitor.checkAll();

        expect(monitor.isHealthy(b1)).toBe(false);

        answers.set(b1.url, { kind: "ok", info: testInfo("b") });
        await monitor.checkAll();

        expect(monitor.isHealthy(b1)).toBe(true);
    });

    it("restores an instance marked down at the next successful check", async () => {
        await monitor.checkAll();
        monitor.markDown(a1, "connect ECONNRESET");

        expect(monitor.isHealthy(a1)).toBe(false);

        await monitor.checkAll();

        expect(monitor.isHealthy(a1)).toBe(true);
    });

    it("forgets removed instances, and starts new ones as down even if the URL was healthy elsewhere", async () => {
        await monitor.checkAll();

        // a1's URL now belongs to variant b.
        const moved: Instance = { variantName: "b", url: a1.url };

        monitor.sync(
            testSnapshot({
                variants: [{ name: "b", public: true, description: null }],
                instances: [moved],
            }),
        );

        expect(monitor.stateOf(moved)).toBe("down");
        expect(monitor.stateOf(a1)).toBe("down");
        expect(monitor.lastInfo("a")).toBeUndefined();

        await monitor.checkAll();

        // a1's URL answers "a", so under variant b it is a mismatch.
        expect(monitor.stateOf(moved)).toBe("mismatch");
    });

    it("ignores the result of a check for an instance removed while it ran", async () => {
        let release: (result: InfoResult) => void = () => undefined;

        getInfo.mockImplementationOnce(
            () => new Promise((resolve) => (release = resolve)),
        );

        const round = monitor.checkAll();

        monitor.sync(testSnapshot({}));
        release({ kind: "ok", info: testInfo("a") });
        await round;

        expect(monitor.lastInfo("a")).toBeUndefined();
    });

    it("shares one round between concurrent calls", async () => {
        await Promise.all([monitor.checkAll(), monitor.checkAll()]);

        expect(getInfo).toHaveBeenCalledTimes(3);
    });

    it("logs the first state and every change, but not repeats", async () => {
        const log = vi.mocked(console.log);
        const warn = vi.mocked(console.warn);
        const error = vi.mocked(console.error);

        await monitor.checkAll();
        await monitor.checkAll();

        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(
            `Instance ${a1.url} of a: unchecked → healthy`,
        );
        expect(error).toHaveBeenCalledWith(
            `Instance ${a2.url} of a: unchecked → mismatch (reports variant "someone-else")`,
        );
        expect(warn).toHaveBeenCalledWith(
            `Instance ${b1.url} of b: unchecked → down (connect ECONNREFUSED)`,
        );

        monitor.markDown(a1, "connect ECONNRESET");

        expect(warn).toHaveBeenLastCalledWith(
            `Instance ${a1.url} of a: healthy → down (connect ECONNRESET)`,
        );
    });

    it("checks on an interval until disposed", async () => {
        vi.useFakeTimers();

        const timer = monitor.start();

        await vi.advanceTimersByTimeAsync(
            testConfig.healthCheck.intervalSeconds * 1000,
        );

        expect(getInfo).toHaveBeenCalledTimes(3);

        timer[Symbol.dispose]();
        await vi.advanceTimersByTimeAsync(
            testConfig.healthCheck.intervalSeconds * 1000 * 3,
        );

        expect(getInfo).toHaveBeenCalledTimes(3);
    });
});
