import { OsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { ProcessorDatabaseTables } from "../../../database/processor/ProcessorDatabaseTables";
import { ProcessorDatabaseLiveOsuDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseLiveOsuDifficultyAttributes";
import { ProcessorDatabaseDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { OsuDifficultyAttributesCacheManager } from "./OsuDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard live calculation difficulty attributes.
 */
export class LiveOsuDifficultyAttributesCacheManager extends OsuDifficultyAttributesCacheManager<
    OsuDifficultyAttributes,
    ProcessorDatabaseLiveOsuDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.live;
    protected override readonly databaseTable =
        ProcessorDatabaseTables.liveOsuDifficultyAttributes;

    protected override convertDatabaseAttributesInternal(
        attributes: ProcessorDatabaseLiveOsuDifficultyAttributes,
    ): Omit<OsuDifficultyAttributes, keyof RawDifficultyAttributes> {
        return {
            speedDifficulty: attributes.speed_difficulty,
            approachRate: attributes.approach_rate,
            speedDifficultStrainCount: attributes.speed_difficult_strain_count,
        };
    }

    protected override convertDifficultyAttributesInternal(
        attributes: OsuDifficultyAttributes,
    ): Omit<
        ProcessorDatabaseLiveOsuDifficultyAttributes,
        keyof ProcessorDatabaseDifficultyAttributes
    > {
        return {
            speed_difficulty: attributes.speedDifficulty,
            mods: attributes.mods.reduce(
                (acc, mod) =>
                    mod.isApplicableToOsu() ? acc | mod.bitwise : acc,
                0,
            ),
            approach_rate: attributes.approachRate,
            speed_difficult_strain_count: attributes.speedDifficultStrainCount,
        };
    }
}
