import type { Config } from "@/config/config";
import { registerDependencies } from "@/dependencies/register";
import type { OfficialDatabase } from "@/official/connection";
import { createOfficialTables } from "@/official/schema";
import { testConfig } from "@test/utils/config";
import { createTestDatabase } from "@test/utils/database";
import type { Db } from "mongodb";
import {
    container as globalContainer,
    type DependencyContainer,
} from "tsyringe";

/**
 * A child container with real implementations except where `overrides` registers fakes, a PGlite job database, and
 * placeholder official and MongoDB handles (tests that reach them must override the repositories).
 */
export async function createTestContainer(
    options: {
        config?: Config;
        overrides?: (container: DependencyContainer) => void;
    } = {},
): Promise<{ container: DependencyContainer } & AsyncDisposable> {
    const resources = new AsyncDisposableStack();
    const { db } = resources.use(await createTestDatabase());
    const config = options.config ?? testConfig;
    const container = globalContainer.createChildContainer();

    registerDependencies(container, {
        cliConfig: config,
        config,
        db,
        // Deliberately empty objects: any accidental use fails loudly instead of reaching a real database.
        officialDb: {} as OfficialDatabase,
        officialTables: createOfficialTables(config.official.tablePrefix),
        aliceDb: {} as Db,
        elainaDb: {} as Db,
    });
    options.overrides?.(container);

    return { container, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
