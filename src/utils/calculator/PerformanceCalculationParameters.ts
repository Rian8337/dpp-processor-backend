import { Accuracy, MapStats } from "@rian8337/osu-base";
import { SliderCheeseInformation } from "@rian8337/osu-droid-replay-analyzer";
import { DifficultyCalculationParameters } from "./DifficultyCalculationParameters";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";

/**
 * Represents a parameter to alter performance calculation result.
 */
export class PerformanceCalculationParameters extends DifficultyCalculationParameters {
    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores.
     */
    tapPenalty: number;

    /**
     * The slider cheese penalties to apply for penalized scores.
     */
    sliderCheesePenalty?: SliderCheeseInformation;

    /**
     * @param accuracy The accuracy achieved.
     * @param combo The combo achieved.
     * @param tapPenalty The tap penalty to apply for penalized scores.
     * @param customStatistics The custom statistics that was used in difficulty calculation.
     * @param sliderCheesePenalty The slider cheese penalties to apply for penalized scores.
     */
    constructor(
        accuracy: Accuracy,
        combo?: number,
        tapPenalty: number = 1,
        customStatistics?: MapStats,
        sliderCheesePenalty?: SliderCheeseInformation
    ) {
        super(customStatistics);

        this.accuracy = accuracy;
        this.combo = combo;
        this.tapPenalty = tapPenalty;
        this.sliderCheesePenalty = sliderCheesePenalty;
    }

    /**
     * Applies difficulty attributes to alter this parameter.
     *
     * @param attributes The difficulty attributes.
     */
    applyFromAttributes(attributes: RawDifficultyAttributes): void {
        const objectCount: number =
            attributes.hitCircleCount +
            attributes.sliderCount +
            attributes.spinnerCount;

        if (this.accuracy.n50 || this.accuracy.n100) {
            this.accuracy = new Accuracy({
                n300:
                    objectCount -
                    this.accuracy.n100 -
                    this.accuracy.n50 -
                    this.accuracy.nmiss,
                n100: this.accuracy.n100,
                n50: this.accuracy.n50,
                nmiss: this.accuracy.nmiss,
            });
        }
    }
}
