import "@/polyfills";
import { ConfigError, loadDatabaseConfig } from "@/config/config";
import { schema } from "@/database/schema";
import { loadManifest } from "@/manifest/manifest";
import { DifficultyAttributesRepository } from "@/repositories/DifficultyAttributesRepository";
import { DatabaseConnection, loadEnvironmentVariables } from "@dpp/server";

/**
 * Deletes difficulty attributes calculated by other calculator versions. Run it from the snapshot whose
 * attributes should be kept: `node releases/<variant>/current/prune.mjs`. Takes no arguments and reads only the
 * database variables.
 */
async function main(): Promise<number> {
    if (process.argv.length > 2) {
        console.error(
            "Usage: node releases/<variant>/current/prune.mjs (takes no arguments)",
        );

        return 1;
    }

    loadEnvironmentVariables();

    const settings = loadDatabaseConfig(process.env);
    const manifest = await loadManifest(
        new URL("./manifest.json", import.meta.url),
        process.env,
    );

    await using database = new DatabaseConnection(settings, schema);

    const deleted = await new DifficultyAttributesRepository(
        database.db,
    ).deleteOtherVersions(manifest.calculatorVersion);

    console.log(
        `Deleted ${deleted.toString()} rows not from calculator version ${manifest.calculatorVersion}`,
    );

    return 0;
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (e: unknown) => {
        console.error(
            "Prune failed:",
            e instanceof ConfigError ? e.message : e,
        );
        process.exitCode = 1;
    },
);
