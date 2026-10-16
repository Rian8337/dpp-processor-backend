import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": "/src", "@test": "/tests" } },
    test: {
        include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        setupFiles: ["./tests/setup.ts"],
        maxWorkers: process.env.CI ? 1 : undefined,
        silent: "passed-only",
        passWithNoTests: true,
        // Undo vi.spyOn spies (e.g. on console or a shared algorithm) after each test.
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**"],
            reportsDirectory: "./coverage",
        },
    },
});
