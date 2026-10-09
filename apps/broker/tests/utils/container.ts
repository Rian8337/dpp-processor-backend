import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import { registerDependencies } from "@/dependencies/register";
import { testConfig } from "@test/utils/config";
import { createTestDatabase } from "@test/utils/database";
import {
    container as globalContainer,
    type DependencyContainer,
} from "tsyringe";

/**
 * A container for a test. Disposing releases the test database unless one was passed in.
 */
export interface TestContainer extends AsyncDisposable {
    readonly container: DependencyContainer;
}

/**
 * Creates a child container with real implementations and a PGlite registry database (unless `db` is given).
 */
export async function createTestContainer(
    options: {
        db?: Database;
        config?: Config;
        overrides?: (container: DependencyContainer) => void;
    } = {},
): Promise<TestContainer> {
    const resources = new AsyncDisposableStack();
    const db = options.db ?? resources.use(await createTestDatabase()).db;
    const container = globalContainer.createChildContainer();

    registerDependencies(container, {
        config: options.config ?? testConfig,
        db,
    });
    options.overrides?.(container);

    return { container, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
