import { defineConfig } from "tsdown";
import { createBuildOptions } from "./scripts/lib/buildOptions.ts";

export default defineConfig(createBuildOptions({ outDir: "dist" }));
