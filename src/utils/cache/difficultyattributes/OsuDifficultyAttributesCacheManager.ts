import { OsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { ProcessorDatabaseLiveOsuDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseLiveOsuDifficultyAttributes";
import { ProcessorDatabaseRebalanceOsuDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseRebalanceOsuDifficultyAttributes";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { Mod, Modes, ModUtil } from "@rian8337/osu-base";

/**
 * A base cache manager for osu!standard difficulty attributes.
 */
export abstract class OsuDifficultyAttributesCacheManager<
    TAttributes extends
        | OsuDifficultyAttributes
        | RebalanceOsuDifficultyAttributes,
    TDatabaseAttributes extends
        | ProcessorDatabaseLiveOsuDifficultyAttributes
        | ProcessorDatabaseRebalanceOsuDifficultyAttributes,
> extends DifficultyAttributesCacheManager<TAttributes, TDatabaseAttributes> {
    protected override readonly mode = Modes.osu;

    protected override convertDatabaseMods(
        attributes: TDatabaseAttributes,
    ): Mod[] {
        return ModUtil.pcModbitsToMods(attributes.mods);
    }
}
