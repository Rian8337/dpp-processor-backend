import { Mod, Modes, ModUtil } from "@rian8337/osu-base";
import {
    OsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import {
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuDifficultyCalculator as RebalanceOsuDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";

/**
 * A base cache manager for osu!standard difficulty attributes.
 */
export abstract class OsuDifficultyAttributesCacheManager<
    TAttributes extends
        | OsuDifficultyAttributes
        | RebalanceOsuDifficultyAttributes,
> extends DifficultyAttributesCacheManager<TAttributes> {
    protected override readonly mode = Modes.osu;

    protected override convertMods(mods: Mod[]): string {
        return (
            this.attributeType === PPCalculationMethod.live
                ? OsuDifficultyCalculator
                : RebalanceOsuDifficultyCalculator
        )
            .retainDifficultyAdjustmentMods(mods)
            .map((m) => m.acronym)
            .sort((a, b) => a.localeCompare(b, "en"))
            .join("");
    }

    /**
     * Converts mods received from the database to a {@link Mod} array.
     *
     * @param mods The mods from the database.
     * @returns The converted mods.
     */
    protected convertDatabaseMods(mods: string): Mod[] {
        return ModUtil.pcStringToMods(mods);
    }
}
