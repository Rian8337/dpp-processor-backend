import { Modes } from "@rian8337/osu-base";
import { ExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";

/**
 * A cache manager for osu!droid rebalance calculation difficulty attributes.
 */
export class RebalanceDroidDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<ExtendedDroidDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;
    protected override readonly mode = Modes.droid;
}
