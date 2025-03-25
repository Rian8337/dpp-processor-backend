import { Collection } from "@discordjs/collection";
import {
    CacheableDifficultyAttributes,
    ExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { processorDb } from "../../../database/processor";
import { rebalanceDroidDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DroidDifficultyAttributesCacheManager } from "./DroidDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!droid rebalance calculation difficulty attributes.
 */
export class RebalanceDroidDifficultyAttributesCacheManager extends DroidDifficultyAttributesCacheManager<ExtendedDroidDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected override async insertToDatabase(
        beatmapId: number,
        oldStatistics: boolean,
        customSpeedMultiplier: number,
        forceCS: number | undefined,
        forceAR: number | undefined,
        forceOD: number | undefined,
        attributes: ExtendedDroidDifficultyAttributes,
    ): Promise<void> {
        await processorDb
            .insert(rebalanceDroidDifficultyAttributesTable)
            .values({
                ...attributes,
                beatmapId,
                oldStatistics,
                speedMultiplier: customSpeedMultiplier,
                forceCS: forceCS ?? -1,
                forceAR: forceAR ?? -1,
                forceOD: forceOD ?? -1,
                mods: this.convertMods(attributes.mods),
                difficultSliders: this.convertDifficultSlidersToDatabase(
                    attributes.difficultSliders,
                ),
                possibleThreeFingeredSections:
                    this.convertHighStrainSectionsToDatabase(
                        attributes.possibleThreeFingeredSections,
                    ),
            });
    }

    protected override async getCacheFromDatabase(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<ExtendedDroidDifficultyAttributes>
    > | null> {
        const schema = createSelectSchema(
            rebalanceDroidDifficultyAttributesTable,
        );

        const result = await processorDb
            .select()
            .from(rebalanceDroidDifficultyAttributesTable)
            .where(
                eq(
                    rebalanceDroidDifficultyAttributesTable.beatmapId,
                    beatmapId,
                ),
            );

        if (result.length === 0) {
            return null;
        }

        const cache = new Collection<
            string,
            CacheableDifficultyAttributes<ExtendedDroidDifficultyAttributes>
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
                {
                    ...parsed,
                    difficultSliders: this.convertDifficultSlidersFromDatabase(
                        parsed.difficultSliders,
                    ),
                    mode: "rebalance",
                    possibleThreeFingeredSections:
                        this.convertHighStrainSectionsFromDatabase(
                            parsed.possibleThreeFingeredSections,
                        ),
                },
            );
        }

        return cache;
    }
}
