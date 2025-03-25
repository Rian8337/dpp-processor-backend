import { Mod, Modes, ModUtil } from "@rian8337/osu-base";
import {
    DifficultSlider,
    DroidDifficultyAttributes,
    DroidDifficultyCalculator,
    HighStrainSection,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { sortAlphabet } from "../../util";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";

/**
 * A base cache manager for osu!droid difficulty attributes.
 */
export abstract class DroidDifficultyAttributesCacheManager<
    TAttributes extends
        | DroidDifficultyAttributes
        | RebalanceDroidDifficultyAttributes,
> extends DifficultyAttributesCacheManager<TAttributes> {
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

    /**
     * Converts mods received from the database to a {@link Mod} array.
     *
     * @param mods The mods from the database.
     * @returns The converted mods.
     */
    protected convertDatabaseMods(mods: string): Mod[] {
        return ModUtil.droidStringToMods(mods);
    }

    /**
     * Converts difficult sliders from the database to an array of `DifficultSlider`.
     *
     * @param str The difficult sliders from the database.
     * @returns An array of `DifficultSlider`.
     */
    protected convertDifficultSlidersFromDatabase(
        str: string,
    ): DifficultSlider[] {
        const sliders = str.split(" ");

        if (!sliders[0]) {
            // First element is an empty string; no difficult sliders.
            return [];
        }

        const result: DifficultSlider[] = [];

        for (let i = 0; i < sliders.length; i += 2) {
            result.push({
                index: parseInt(sliders[i]),
                difficultyRating: parseFloat(sliders[i + 1]),
            });
        }

        return result;
    }

    /**
     * Converts `DifficultSlider`s to a string that can be stored in the database.
     *
     * @param sliders The `DifficultSlider`s to convert.
     * @returns The converted string.
     */
    protected convertDifficultSlidersToDatabase(
        sliders: DifficultSlider[],
    ): string {
        return sliders
            .map(
                (s) => `${s.index.toString()} ${s.difficultyRating.toString()}`,
            )
            .join(" ");
    }

    /**
     * Converts high strain sections from the database to an array of `HighStrainSection`.
     *
     * @param str The high strain sections from the database.
     * @returns An array of `HighStrainSection`.
     */
    protected convertHighStrainSectionsFromDatabase(
        str: string,
    ): HighStrainSection[] {
        const sections = str.split(" ");

        if (!sections[0]) {
            // First element is an empty string; no possible three-fingered sections.
            return [];
        }

        const result: HighStrainSection[] = [];

        for (let i = 0; i < sections.length; i += 3) {
            result.push({
                firstObjectIndex: parseInt(sections[i]),
                lastObjectIndex: parseInt(sections[i + 1]),
                sumStrain: parseFloat(sections[i + 2]),
            });
        }

        return result;
    }

    /**
     * Converts `HighStrainSection`s to a string that can be stored in the database.
     *
     * @param sections The `HighStrainSection`s to convert.
     * @returns The converted string.
     */
    protected convertHighStrainSectionsToDatabase(
        sections: HighStrainSection[],
    ): string {
        return sections
            .map(
                (s) =>
                    `${s.firstObjectIndex.toString()} ${s.lastObjectIndex.toString()} ${s.sumStrain.toString()}`,
            )
            .join(" ");
    }
}
