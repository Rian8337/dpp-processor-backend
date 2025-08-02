import { ProcessorDb } from "@/database/processor";
import {
    beatmaps as beatmapTable,
    IBeatmap,
} from "@/database/processor/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { eq, SQL, sql } from "drizzle-orm";
import { inject } from "tsyringe";
import { BaseProcessorRepository } from "./BaseProcessorRepository";
import { IBeatmapRepository } from "./IBeatmapRepository";

/**
 * Provides operations for interacting with beatmaps in the processor database.
 */
@Repository(dependencyTokens.beatmapRepository)
export class BeatmapRepository
    extends BaseProcessorRepository
    implements IBeatmapRepository
{
    constructor(@inject(dependencyTokens.processorDb) db: ProcessorDb) {
        super(db);
    }

    async getBeatmap(idOrHash: number | string): Promise<IBeatmap | null> {
        return this.db
            .select()
            .from(beatmapTable)
            .where(
                typeof idOrHash === "number"
                    ? sql`${beatmapTable.id} = ${idOrHash}`
                    : sql`${beatmapTable.hash} = ${idOrHash}`,
            )
            .limit(1)
            .then((res) => res.at(0) ?? null);
    }

    async updateMaxCombo(id: number, maxCombo: number): Promise<boolean> {
        return this.db
            .update(beatmapTable)
            .set({ maxCombo })
            .where(eq(beatmapTable.id, id))
            .then((res) => res.rowCount === 1);
    }

    async insert(...beatmaps: IBeatmap[]): Promise<boolean> {
        if (beatmaps.length === 0) {
            return true;
        }

        return this.db
            .insert(beatmapTable)
            .values(beatmaps)
            .onConflictDoUpdate({
                target: beatmapTable.id,
                set: {
                    hash: sql.raw(`excluded.${beatmapTable.hash.name}`),
                    title: sql.raw(`excluded.${beatmapTable.title.name}`),
                    hitLength: sql.raw(
                        `excluded.${beatmapTable.hitLength.name}`,
                    ),
                    totalLength: sql.raw(
                        `excluded.${beatmapTable.totalLength.name}`,
                    ),
                    maxCombo: sql.raw(`excluded.${beatmapTable.maxCombo.name}`),
                    objectCount: sql.raw(
                        `excluded.${beatmapTable.objectCount.name}`,
                    ),
                    rankedStatus: sql.raw(
                        `excluded.${beatmapTable.rankedStatus.name}`,
                    ),
                    lastChecked: sql.raw(
                        `excluded.${beatmapTable.lastChecked.name}`,
                    ),
                    // The satisfies operator forces TypeScript to throw an error if a newly added column is not included here.
                } satisfies Record<keyof Omit<IBeatmap, "id">, SQL>,
            })
            .then((res) => res.rowCount === beatmaps.length);
    }

    async delete(id: number): Promise<boolean> {
        return this.db
            .delete(beatmapTable)
            .where(eq(beatmapTable.id, id))
            .then((res) => res.rowCount === 1);
    }

    async refreshCheckDate(id: number): Promise<boolean> {
        return this.db
            .update(beatmapTable)
            .set({ lastChecked: new Date() })
            .where(eq(beatmapTable.id, id))
            .then((res) => res.rowCount === 1);
    }
}
