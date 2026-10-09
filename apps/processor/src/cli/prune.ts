import "@/polyfills";
import { loadConfig } from "@/config/config";
import { schema } from "@/database/schema";
import { loadManifest } from "@/manifest/manifest";
import { DifficultyAttributesRepository } from "@/repositories/DifficultyAttributesRepository";
import { DatabaseConnection, loadEnvironmentVariables } from "@dpp/server";

/**
 * Deletes difficulty attributes calculated by other calculator versions. Run it from the snapshot whose
 * attributes should be kept: `node releases/<variant>/current/prune.mjs`.
 */
async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);
    const manifest = await loadManifest(
        new URL("./manifest.json", import.meta.url),
        process.env,
    );

    await using database = new DatabaseConnection(config.database, schema);

    const deleted = await new DifficultyAttributesRepository(
        database.db,
    ).deleteOtherVersions(manifest.calculatorVersion);

    console.log(
        `Deleted ${deleted.toString()} rows not from calculator version ${manifest.calculatorVersion}`,
    );
}

main().catch((e: unknown) => {
    console.error("Prune failed:", e);
    process.exit(1);
});
