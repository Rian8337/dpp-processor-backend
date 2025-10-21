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
     * The total score achieved.
     */
    totalScore?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: CloneableAccuracy;

    /**
     * The number of slider ticks that were hit.
     *
     * If {@link sliderTicksMissed} is defined, this value will be ignored.
     */
    sliderTickHits?: number;

    /**
     * The number of slider ticks that were missed.
     */
    sliderTicksMissed?: number;

    /**
     * The number of slider ends that were hit.
     *
     * If {@link sliderEndsDropped} is defined, this value will be ignored.
     */
    sliderEndHits?: number;

    /**
     * The number of slider ends that were dropped.
     */
    sliderEndsDropped?: number;

    /**
     * The tap penalty to apply for penalized scores.
     */
    tapPenalty: Optional<TFromCalculation, number>;

    /**
     * The slider cheese penalties to apply for penalized scores.
     */
    sliderCheesePenalty: Optional<TFromCalculation, SliderCheeseInformation>;
}
