import { SliderCheeseInformation } from "@rian8337/osu-droid-replay-analyzer";
import { CloneableAccuracy } from "./CloneableAccuracy";
import { CloneableDifficultyCalculationParameters } from "./CloneableDifficultyCalculationParameters";
import { Optional } from "../../structures/Optional";

/**
 * Represents a parameter to alter performance calculation result that can be cloned
 * for specific purposes (i.e., passing data between worker threads).
 */
export interface CloneablePerformanceCalculationParameters<
    TFromCalculation extends boolean = boolean,
> extends CloneableDifficultyCalculationParameters {
    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: CloneableAccuracy;

    /**
     * The tap penalty to apply for penalized scores.
     */
    tapPenalty: Optional<TFromCalculation, number>;

    /**
     * The slider cheese penalties to apply for penalized scores.
     */
    sliderCheesePenalty: Optional<TFromCalculation, SliderCheeseInformation>;
}
