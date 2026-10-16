import { describe, expect, it } from "vitest";
import { isProcessorRoute, maxRequestBodyBytes, processorRoutes } from "../src";

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
    it("is 1 MiB", () => {
        expect(maxRequestBodyBytes).toBe(1_048_576);
    });
});
