import { Collection } from "@discordjs/collection";
import {
    CacheableDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { processorDb } from "../../../database/processor";
import { rebalanceOsuDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { OsuDifficultyAttributesCacheManager } from "./OsuDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard rebalance calculation difficulty attributes.
 */
export class RebalanceOsuDifficultyAttributesCacheManager extends OsuDifficultyAttributesCacheManager<OsuDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected async insertToDatabase(
        beatmapId: number,
        oldStatistics: boolean,
        customSpeedMultiplier: number,
        forceCS: number | undefined,
        forceAR: number | undefined,
        forceOD: number | undefined,
        attributes: OsuDifficultyAttributes,
    ): Promise<void> {
        await processorDb.insert(rebalanceOsuDifficultyAttributesTable).values({
            ...attributes,
            beatmapId,
            oldStatistics,
            speedMultiplier: customSpeedMultiplier,
            forceCS: forceCS ?? -1,
            forceAR: forceAR ?? -1,
            forceOD: forceOD ?? -1,
            mods: this.convertMods(attributes.mods),
        });
    }

    protected async getCacheFromDatabase(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<OsuDifficultyAttributes>
    > | null> {
        const schema = createSelectSchema(
            rebalanceOsuDifficultyAttributesTable,
        );

        const result = await processorDb
            .select()
            .from(rebalanceOsuDifficultyAttributesTable)
            .where(
                eq(rebalanceOsuDifficultyAttributesTable.beatmapId, beatmapId),
            );

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
