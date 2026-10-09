import { difficultyAttributesTable as table } from "@/database/schema";
import type { Database } from "@/database/types";
import { Injectable } from "@dpp/server";
import { dependencyTokens } from "@/dependencies/tokens";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { and, eq, ne } from "drizzle-orm";
import { inject } from "tsyringe";
import type {
    DifficultyAttributesKey,
    IDifficultyAttributesRepository,
} from "./IDifficultyAttributesRepository";

@Injectable(dependencyTokens.difficultyAttributesRepository)
export class DifficultyAttributesRepository implements IDifficultyAttributesRepository {
    constructor(@inject(dependencyTokens.db) private readonly db: Database) {}

    async find(
        key: DifficultyAttributesKey,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes> | null> {
        const rows = await this.db
            .select({ attributes: table.attributes })
            .from(table)
            .where(
                and(
                    eq(table.calculatorVersion, key.calculatorVersion),
                    eq(table.beatmapHash, key.beatmapHash),
                    eq(table.mods, key.mods),
                ),
            )
            .limit(1);

        return rows[0]?.attributes ?? null;
    }

    async insert(
        key: DifficultyAttributesKey,
        attributes: CacheableDifficultyAttributes<IDifficultyAttributes>,
    ): Promise<void> {
        await this.db
            .insert(table)
            .values({ ...key, attributes })
            .onConflictDoNothing();
    }

    async deleteOtherVersions(calculatorVersion: string): Promise<number> {
        // Usually deletes most of the table, where a sequential scan is the efficient plan anyway.
        const deleted = await this.db
            .delete(table)
            .where(ne(table.calculatorVersion, calculatorVersion))
            .returning({ beatmapHash: table.beatmapHash });

        return deleted.length;
    }
}
