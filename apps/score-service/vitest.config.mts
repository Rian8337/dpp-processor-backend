import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": "/src", "@test": "/tests" } },
    test: {
        include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        setupFiles: ["./tests/setup.ts"],
        // Every integration file starts WASM PGlite, mongod, or mariadbd; too many at once starve each other.
        maxWorkers: process.env.CI ? 1 : 4,
        testTimeout: 30_000,
        hookTimeout: 60_000,
        silent: "passed-only",
        passWithNoTests: true,
        // Undo vi.spyOn spies (e.g. on console) after each test.
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**"],
            reportsDirectory: "./coverage",
        },
    },
});
