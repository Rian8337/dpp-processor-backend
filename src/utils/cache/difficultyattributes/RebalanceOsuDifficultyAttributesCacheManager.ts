import { Mod, ModUtil, Modes } from "@rian8337/osu-base";
import { OsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DatabaseTables } from "../../../database/postgres/DatabaseTables";
import { DatabaseDifficultyAttributes } from "../../../database/postgres/schema/DatabaseDifficultyAttributes";
import { DatabaseRebalanceOsuDifficultyAttributes } from "../../../database/postgres/schema/DatabaseRebalanceOsuDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";

/**
 * A cache manager for osu!standard rebalance calculation difficulty attributes.
 */
export class RebalanceOsuDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<
    OsuDifficultyAttributes,
    DatabaseRebalanceOsuDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;
    protected override readonly mode = Modes.osu;
    protected override readonly databaseTable =
        DatabaseTables.rebalanceOsuDifficultyAttributes;

    protected override convertDatabaseMods(
        attributes: DatabaseRebalanceOsuDifficultyAttributes
    ): Mod[] {
        return ModUtil.pcModbitsToMods(attributes.mods);
    }

    protected override convertDatabaseAttributesInternal(
        attributes: DatabaseRebalanceOsuDifficultyAttributes
    ): Omit<OsuDifficultyAttributes, keyof RawDifficultyAttributes> {
        return { speedDifficulty: attributes.speed_difficulty };
    }

    protected override convertDifficultyAttributesInternal(
        attributes: OsuDifficultyAttributes
    ): Omit<
        DatabaseRebalanceOsuDifficultyAttributes,
        keyof DatabaseDifficultyAttributes
    > {
        return {
            speed_difficulty: attributes.speedDifficulty,
            mods: attributes.mods.reduce(
                (acc, mod) =>
                    mod.isApplicableToOsu() ? acc | mod.bitwise : acc,
                0
            ),
        };
    }
}
