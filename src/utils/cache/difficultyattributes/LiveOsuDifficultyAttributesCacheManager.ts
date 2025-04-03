import { Collection } from "@discordjs/collection";
import {
    CacheableDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { processorDb } from "../../../database/processor";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import { liveOsuDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { OsuDifficultyAttributesCacheManager } from "./OsuDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard live calculation difficulty attributes.
 */
export class LiveOsuDifficultyAttributesCacheManager extends OsuDifficultyAttributesCacheManager<OsuDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.live;

    protected override readonly databaseTable =
        liveOsuDifficultyAttributesTable;

    protected convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<
        OsuDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return attributes;
    }

    protected convertDifficultyAttributes(
        attributes: OsuDifficultyAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        return attributes;
    }

    protected async insertToDatabase(
        beatmapId: number,
        oldStatistics: boolean,
        customSpeedMultiplier: number,
        forceCS: number | undefined,
        forceAR: number | undefined,
        forceOD: number | undefined,
        attributes: OsuDifficultyAttributes,
    ): Promise<void> {
        await processorDb.insert(liveOsuDifficultyAttributesTable).values({
            ...attributes,
            ...this.constructAttributePrimaryKeys(
                beatmapId,
                attributes.mods,
                oldStatistics,
                customSpeedMultiplier,
                forceCS,
                forceAR,
                forceOD,
            ),
        });
    }

    protected async getCacheFromDatabase(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<OsuDifficultyAttributes>
    > | null> {
        const schema = createSelectSchema(liveOsuDifficultyAttributesTable);

        const result = await processorDb
            .select()
            .from(liveOsuDifficultyAttributesTable)
            .where(eq(liveOsuDifficultyAttributesTable.beatmapId, beatmapId));

        if (result.length === 0) {
            return null;
        }

        const cache = new Collection<
            string,
            CacheableDifficultyAttributes<OsuDifficultyAttributes>
        >();

        for (const row of result) {
            const parsed = schema.parse(row);

            this.removePrimaryKeys(parsed);

            cache.set(
                this.getAttributeName(
                    this.convertDatabaseMods(parsed.mods),
                    parsed.oldStatistics,
                    parsed.speedMultiplier,
                    parsed.forceCS,
                    parsed.forceAR,
                    parsed.forceOD,
                ),
                parsed,
            );
        }

        return cache;
    }
}
