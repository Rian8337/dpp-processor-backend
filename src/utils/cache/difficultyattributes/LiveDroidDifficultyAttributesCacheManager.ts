import { Modes } from "@rian8337/osu-base";
import { ExtendedDroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";

/**
 * A cache manager for osu!droid live calculation difficulty attributes.
 */
export class LiveDroidDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<ExtendedDroidDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.live;
    protected override readonly mode = Modes.droid;
}
