import { DroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { ProcessorDatabaseLiveDroidDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseLiveDroidDifficultyAttributes";
import { ProcessorDatabaseRebalanceDroidDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseRebalanceDroidDifficultyAttributes";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { Mod, Modes, ModUtil } from "@rian8337/osu-base";

/**
 * A base cache manager for osu!droid difficulty attributes.
 */
export abstract class DroidDifficultyAttributesCacheManager<
    TAttributes extends
        | DroidDifficultyAttributes
        | RebalanceDroidDifficultyAttributes,
    TDatabaseAttributes extends
        | ProcessorDatabaseLiveDroidDifficultyAttributes
        | ProcessorDatabaseRebalanceDroidDifficultyAttributes,
> extends DifficultyAttributesCacheManager<TAttributes, TDatabaseAttributes> {
    protected override readonly mode = Modes.droid;

    protected override convertDatabaseMods(
        attributes: TDatabaseAttributes,
    ): Mod[] {
        return ModUtil.droidStringToMods(attributes.mods);
    }
}
