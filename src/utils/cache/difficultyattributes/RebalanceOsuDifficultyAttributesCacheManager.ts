import { Modes } from "@rian8337/osu-base";
import { OsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { ProcessorDatabaseTables } from "../../../database/processor/ProcessorDatabaseTables";
import { ProcessorDatabaseDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseDifficultyAttributes";
import { ProcessorDatabaseRebalanceOsuDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseRebalanceOsuDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { OsuDifficultyAttributesCacheManager } from "./OsuDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard rebalance calculation difficulty attributes.
 */
export class RebalanceOsuDifficultyAttributesCacheManager extends OsuDifficultyAttributesCacheManager<
    OsuDifficultyAttributes,
    ProcessorDatabaseRebalanceOsuDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;
    protected override readonly mode = Modes.osu;
    protected override readonly databaseTable =
        ProcessorDatabaseTables.rebalanceOsuDifficultyAttributes;

    protected override convertDatabaseAttributesInternal(
        attributes: ProcessorDatabaseRebalanceOsuDifficultyAttributes,
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
        ProcessorDatabaseRebalanceOsuDifficultyAttributes,
        keyof ProcessorDatabaseDifficultyAttributes
    > {
        return {
            speed_difficulty: attributes.speedDifficulty,
            approach_rate: attributes.approachRate,
            speed_difficult_strain_count: attributes.speedDifficultStrainCount,
        };
    }
}
