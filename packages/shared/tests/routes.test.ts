import { describe, expect, it } from "vitest";
import {
    isProcessorRoute,
    maxReplayBytes,
    maxRequestBodyBytes,
    processorRoutes,
} from "../src";

describe("processorRoutes", () => {
    it("lists the calculation routes", () => {
        expect(processorRoutes).toEqual([
            "/difficulty",
            "/performance",
            "/performance/replay",
        ]);
    });

    it("recognizes only those routes", () => {
        expect(isProcessorRoute("/performance/replay")).toBe(true);
        expect(isProcessorRoute("/info")).toBe(false);
        expect(isProcessorRoute("/performance/")).toBe(false);
        expect(isProcessorRoute("/difficulty/../info")).toBe(false);
    });
});

describe("maxRequestBodyBytes", () => {
    it("is 4 MiB", () => {
        expect(maxRequestBodyBytes).toBe(4_194_304);
    });

    it("fits the largest replay as base64 in a JSON body", () => {
        const body = JSON.stringify({
            replay: Buffer.alloc(maxReplayBytes).toString("base64"),
            strainChart: true,
        });

        expect(Buffer.byteLength(body)).toBeLessThanOrEqual(
            maxRequestBodyBytes,
        );
    });
});
