import { Mod, ModUtil, Modes } from "@rian8337/osu-base";
import {
    DifficultSlider,
    ExtendedDroidDifficultyAttributes,
    HighStrainSection,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DatabaseRebalanceDroidDifficultyAttributes } from "../../../database/postgres/schema/DatabaseRebalanceDroidDifficultyAttributes";
import { DatabaseTables } from "../../../database/postgres/DatabaseTables";
import { DatabaseDifficultyAttributes } from "../../../database/postgres/schema/DatabaseDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";

/**
 * A cache manager for osu!droid rebalance calculation difficulty attributes.
 */
export class RebalanceDroidDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<
    ExtendedDroidDifficultyAttributes,
    DatabaseRebalanceDroidDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;
    protected override readonly mode = Modes.droid;
    protected override readonly databaseTable =
        DatabaseTables.rebalanceDroidDifficultyAttributes;

    protected override convertDatabaseMods(
        attributes: DatabaseRebalanceDroidDifficultyAttributes
    ): Mod[] {
        return ModUtil.droidStringToMods(attributes.mods);
    }

    protected override convertDatabaseAttributesInternal(
        attributes: DatabaseRebalanceDroidDifficultyAttributes
    ): Omit<ExtendedDroidDifficultyAttributes, keyof RawDifficultyAttributes> {
        return {
            mode: "rebalance",
            aimDifficultStrainCount: attributes.aim_difficult_strain_count,
            aimNoteCount: attributes.aim_note_count,
            averageSpeedDeltaTime: attributes.average_speed_delta_time,
            difficultSliders: ((): DifficultSlider[] => {
                const sliders = attributes.difficult_sliders.split(" ");

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
            })(),
            flashlightDifficultStrainCount:
                attributes.flashlight_difficult_strain_count,
            flashlightSliderFactor: attributes.flashlight_slider_factor,
            possibleThreeFingeredSections: ((): HighStrainSection[] => {
                const sections =
                    attributes.possible_three_fingered_sections.split(" ");

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
            })(),
            rhythmDifficulty: attributes.rhythm_difficulty,
            tapDifficultStrainCount: attributes.tap_difficult_strain_count,
            tapDifficulty: attributes.tap_difficulty,
            vibroFactor: attributes.vibro_factor,
            visualDifficultStrainCount:
                attributes.visual_difficult_strain_count,
            visualDifficulty: attributes.visual_difficulty,
            visualSliderFactor: attributes.visual_slider_factor,
        };
    }

    protected override convertDifficultyAttributesInternal(
        attributes: ExtendedDroidDifficultyAttributes
    ): Omit<
        DatabaseRebalanceDroidDifficultyAttributes,
        keyof DatabaseDifficultyAttributes
    > {
        return {
            aim_difficult_strain_count: attributes.aimDifficultStrainCount,
            aim_note_count: attributes.aimNoteCount,
            average_speed_delta_time: attributes.averageSpeedDeltaTime,
            difficult_sliders: attributes.difficultSliders
                .map((slider) => `${slider.index} ${slider.difficultyRating}`)
                .join(" "),
            flashlight_difficult_strain_count:
                attributes.flashlightDifficultStrainCount,
            flashlight_slider_factor: attributes.flashlightSliderFactor,
            mods: attributes.mods.reduce(
                (a, m) => a + (m.isApplicableToDroid() ? m.droidString : ""),
                ""
            ),
            possible_three_fingered_sections:
                attributes.possibleThreeFingeredSections
                    .map(
                        (section) =>
                            `${section.firstObjectIndex} ${section.lastObjectIndex} ${section.sumStrain}`
                    )
                    .join(" "),
            rhythm_difficulty: attributes.rhythmDifficulty,
            tap_difficult_strain_count: attributes.tapDifficultStrainCount,
            tap_difficulty: attributes.tapDifficulty,
            vibro_factor: attributes.vibroFactor,
            visual_difficult_strain_count:
                attributes.visualDifficultStrainCount,
            visual_difficulty: attributes.visualDifficulty,
            visual_slider_factor: attributes.visualSliderFactor,
        };
    }
}
