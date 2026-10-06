import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import { registerDependencies } from "@/dependencies/register";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import { Modes } from "@rian8337/osu-base";
import {
    container as globalContainer,
    type DependencyContainer,
} from "tsyringe";
import { FixtureBeatmapServiceClient } from "./beatmaps";
import { createTestDatabase } from "./database";

export const testApiKey = "test-api-key-0123456789";

export const testConfig: Config = {
    port: 0,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    beatmapService: { url: "http://beatmaps.invalid/api/beatmap", key: "" },
    apiKey: testApiKey,
    calculation: { threads: 0, maxQueue: 100 },
};

export function testManifest(mode: Modes): VariantManifest {
    return {
        id: `test-${mode}`,
        mode,
        algorithm: "live",
        calculatorVersion: "0123456789abcdef",
        source: "npm",
        builtAt: "2026-10-05T00:00:00.000Z",
    };
}

/**
 * A container for a test. Disposing releases what the container created: the runner, and the test database
 * unless one was passed in.
 */
export interface TestContainer extends AsyncDisposable {
    readonly container: DependencyContainer;
}

/**
 * Creates a child container with real implementations, an inline runner, a PGlite database (unless `db` is
 * given), and the fixture beatmap service client.
 */
export async function createTestContainer(
    options: {
        mode?: Modes;
        db?: Database;
        overrides?: (container: DependencyContainer) => void;
    } = {},
): Promise<TestContainer> {
    const mode = options.mode ?? Modes.Droid;
    const algorithm = createAlgorithm(mode);
    const resources = new AsyncDisposableStack();
    const runner = resources.use(new InlineRunner(algorithm));
    const db = options.db ?? resources.use(await createTestDatabase()).db;
    const container = globalContainer.createChildContainer();

    registerDependencies(container, {
        config: testConfig,
        manifest: testManifest(mode),
        algorithm,
        runner,
        db,
    });

    container.registerInstance(
        dependencyTokens.beatmapServiceClient,
        new FixtureBeatmapServiceClient(),
    );
    options.overrides?.(container);

    return { container, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
