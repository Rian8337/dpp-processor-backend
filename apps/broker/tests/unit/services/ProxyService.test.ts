import type {
    ForwardResult,
    IProcessorClient,
} from "@/clients/IProcessorClient";
import { instanceKey } from "@/registry/snapshot";
import type { Instance, Variant } from "@/registry/types";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import { InstanceSelector } from "@/services/InstanceSelector";
import { ProxyService } from "@/services/ProxyService";
import {
    ProcessorError,
    ProcessorTimeoutError,
    VariantUnavailableError,
} from "@/types/errors";
import { testConfig, testProcessorApiKey } from "@test/utils/config";
import { testSnapshot } from "@test/utils/registry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const urls = ["http://127.0.0.1:1", "http://127.0.0.1:2"];

function variantWith(count: number): Variant {
    const variant = testSnapshot({
        variants: [
            {
                name: "droid-live",
                public: true,
                pinned: false,
                title: null,
                description: null,
            },
        ],
        instances: urls
            .slice(0, count)
            .map((url) => ({ variantName: "droid-live", url })),
    }).variants.get("droid-live");

    if (!variant) {
        throw new Error("test snapshot is missing the variant");
    }

    return variant;
}

const json = (status: number, body: unknown): ForwardResult => ({
    kind: "response",
    status,
    contentType: "application/json; charset=utf-8",
    body: Buffer.from(JSON.stringify(body)),
});

describe("ProxyService", () => {
    const body = Buffer.from('{"beatmap":{"id":1}}');
    let healthy: Set<string>;
    let markDown: ReturnType<typeof vi.fn<IHealthMonitor["markDown"]>>;
    let forward: ReturnType<typeof vi.fn<IProcessorClient["forward"]>>;
    let proxy: ProxyService;

    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        healthy = new Set(
            urls.map((url) => instanceKey({ variantName: "droid-live", url })),
        );
        markDown = vi.fn<IHealthMonitor["markDown"]>((instance: Instance) => {
            healthy.delete(instanceKey(instance));
        });
        forward = vi.fn<IProcessorClient["forward"]>(() =>
            Promise.resolve(json(200, { difficulty: {} })),
        );

        const health = {
            isHealthy: (instance: Instance) =>
                healthy.has(instanceKey(instance)),
            markDown,
        };

        proxy = new ProxyService(
            { getInfo: vi.fn<IProcessorClient["getInfo"]>(), forward },
            new InstanceSelector(health),
            health,
            testConfig,
        );
    });

    it("forwards to a healthy instance with the processor timeout and returns its response", async () => {
        const response = await proxy.forward(
            variantWith(1),
            "/difficulty",
            body,
        );

        expect(forward).toHaveBeenCalledWith(
            urls[0],
            "/difficulty",
            body,
            testConfig.processor.timeoutSeconds * 1000,
        );
        expect(response.status).toBe(200);
        expect(JSON.parse(response.body.toString())).toEqual({
            difficulty: {},
        });
    });

    it("fails with VARIANT_UNAVAILABLE when no instance is healthy", async () => {
        healthy.clear();

        await expect(
            proxy.forward(variantWith(2), "/difficulty", body),
        ).rejects.toThrow(VariantUnavailableError);
        expect(forward).not.toHaveBeenCalled();
    });

    it("marks an unreachable instance down and retries once on another", async () => {
        forward.mockResolvedValueOnce({
            kind: "connection-failed",
            reason: "ECONNREFUSED",
        });

        const response = await proxy.forward(
            variantWith(2),
            "/difficulty",
            body,
        );

        expect(response.status).toBe(200);
        expect(markDown).toHaveBeenCalledTimes(1);
        expect(markDown).toHaveBeenCalledWith(
            { variantName: "droid-live", url: urls[0] },
            "ECONNREFUSED",
        );
        expect(forward.mock.calls.map((call) => call[0])).toEqual([
            urls[0],
            urls[1],
        ]);
    });

    it("fails with PROCESSOR_ERROR when the retry also cannot connect", async () => {
        forward.mockResolvedValue({
            kind: "connection-failed",
            reason: "ECONNREFUSED",
        });

        await expect(
            proxy.forward(variantWith(2), "/difficulty", body),
        ).rejects.toThrow(ProcessorError);
        expect(markDown).toHaveBeenCalledTimes(2);
    });

    it("does not retry when the only instance cannot be reached", async () => {
        forward.mockResolvedValue({
            kind: "connection-failed",
            reason: "ECONNREFUSED",
        });

        await expect(
            proxy.forward(variantWith(1), "/difficulty", body),
        ).rejects.toThrow(ProcessorError);
        expect(forward).toHaveBeenCalledTimes(1);
    });

    it("reports a timeout as PROCESSOR_TIMEOUT without retrying or marking down", async () => {
        const warn = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);

        forward.mockResolvedValue({ kind: "timeout" });

        await expect(
            proxy.forward(variantWith(2), "/difficulty", body),
        ).rejects.toThrow(ProcessorTimeoutError);
        expect(forward).toHaveBeenCalledTimes(1);
        expect(markDown).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Processor at http:\/\/\S+ \(\S+\) did not respond within \d+ s$/,
            ),
        );
    });

    it("reports a broken response as PROCESSOR_ERROR without retrying", async () => {
        forward.mockResolvedValue({ kind: "broken", reason: "terminated" });

        await expect(
            proxy.forward(variantWith(2), "/difficulty", body),
        ).rejects.toThrow(ProcessorError);
        expect(forward).toHaveBeenCalledTimes(1);
    });

    it("turns a processor 401 into PROCESSOR_ERROR and logs which instance rejected the key", async () => {
        const error = vi.mocked(console.error);

        forward.mockResolvedValue(
            json(401, { error: { code: "UNAUTHORIZED", message: "x" } }),
        );

        await expect(
            proxy.forward(variantWith(1), "/difficulty", body),
        ).rejects.toThrow(ProcessorError);
        expect(JSON.stringify(error.mock.calls)).toContain(urls[0]);
        expect(JSON.stringify(error.mock.calls)).toContain("PROCESSOR_API_KEY");
        expect(JSON.stringify(error.mock.calls)).not.toContain(
            testProcessorApiKey,
        );
    });

    it("rejects a non-JSON response", async () => {
        forward.mockResolvedValue({
            kind: "response",
            status: 200,
            contentType: "text/html",
            body: Buffer.from("<html>"),
        });

        await expect(
            proxy.forward(variantWith(1), "/difficulty", body),
        ).rejects.toThrow(ProcessorError);
    });

    it.each([
        [500, "CALCULATION_FAILED"],
        [503, "OVERLOADED"],
        [404, "BEATMAP_NOT_FOUND"],
    ])(
        "passes a processor %i %s through unchanged, without retrying or marking down",
        async (status, code) => {
            forward.mockResolvedValue(
                json(status, { error: { code, message: "m" } }),
            );

            const response = await proxy.forward(
                variantWith(2),
                "/performance",
                body,
            );

            expect(response.status).toBe(status);
            expect(JSON.parse(response.body.toString())).toEqual({
                error: { code, message: "m" },
            });
            expect(forward).toHaveBeenCalledTimes(1);
            expect(markDown).not.toHaveBeenCalled();
        },
    );
});
