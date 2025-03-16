import {
    DroidDifficultyAttributes,
    DroidDifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { ProcessorDatabaseLiveDroidDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseLiveDroidDifficultyAttributes";
import { ProcessorDatabaseRebalanceDroidDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseRebalanceDroidDifficultyAttributes";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { Mod, Modes, ModUtil } from "@rian8337/osu-base";
import { sortAlphabet } from "../../util";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";

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

    protected override convertMods(mods: Mod[]): string {
        return (
            sortAlphabet(
                (this.attributeType === PPCalculationMethod.live
                    ? DroidDifficultyCalculator
                    : RebalanceDroidDifficultyCalculator
                )
                    .retainDifficultyAdjustmentMods(mods)
                    .reduce(
                        (a, m) =>
                            a + (m.isApplicableToDroid() ? m.droidString : ""),
                        "",
                    ),
            ) || "-"
        );
    }

    protected override convertDatabaseMods(
        attributes: TDatabaseAttributes,
    ): Mod[] {
        return ModUtil.droidStringToMods(attributes.mods);
    }
}
