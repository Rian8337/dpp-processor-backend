import {
    DifficultSlider,
    ExtendedDroidDifficultyAttributes,
    HighStrainSection,
} from "@rian8337/osu-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { ProcessorDatabaseLiveDroidDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseLiveDroidDifficultyAttributes";
import { ProcessorDatabaseTables } from "../../../database/processor/ProcessorDatabaseTables";
import { ProcessorDatabaseDifficultyAttributes } from "../../../database/processor/schema/ProcessorDatabaseDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { DroidDifficultyAttributesCacheManager } from "./DroidDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!droid live calculation difficulty attributes.
 */
export class LiveDroidDifficultyAttributesCacheManager extends DroidDifficultyAttributesCacheManager<
    ExtendedDroidDifficultyAttributes,
    ProcessorDatabaseLiveDroidDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.live;
    protected override readonly databaseTable =
        ProcessorDatabaseTables.liveDroidDifficultyAttributes;

    protected override convertDatabaseAttributesInternal(
        attributes: ProcessorDatabaseLiveDroidDifficultyAttributes,
    ): Omit<ExtendedDroidDifficultyAttributes, keyof RawDifficultyAttributes> {
        return {
            mode: "live",
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
        attributes: ExtendedDroidDifficultyAttributes,
    ): Omit<
        ProcessorDatabaseLiveDroidDifficultyAttributes,
        keyof ProcessorDatabaseDifficultyAttributes
    > {
        return {
            aim_note_count: attributes.aimNoteCount,
            average_speed_delta_time: attributes.averageSpeedDeltaTime,
            difficult_sliders: attributes.difficultSliders
                .map(
                    (slider) =>
                        `${slider.index.toString()} ${slider.difficultyRating.toString()}`,
                )
                .join(" "),
            flashlight_difficult_strain_count:
                attributes.flashlightDifficultStrainCount,
            flashlight_slider_factor: attributes.flashlightSliderFactor,
            possible_three_fingered_sections:
                attributes.possibleThreeFingeredSections
                    .map(
                        (section) =>
                            `${section.firstObjectIndex.toString()} ${section.lastObjectIndex.toString()} ${section.sumStrain.toString()}`,
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
