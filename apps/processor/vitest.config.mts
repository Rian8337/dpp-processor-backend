import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": "/src", "@test": "/tests" } },
    test: {
        include: ["tests/**/*.test.ts"],
        maxWorkers: process.env.CI ? 1 : undefined,
        silent: "passed-only",
        passWithNoTests: true,
    },
});
