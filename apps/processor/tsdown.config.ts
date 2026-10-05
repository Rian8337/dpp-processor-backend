import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts"],
    format: "esm",
    tsconfig: "tsconfig.build.json",
    clean: true,
    // Workspace packages are consumed from TypeScript source, so they must be bundled.
    deps: { alwaysBundle: [/^@dpp\//] },
});
