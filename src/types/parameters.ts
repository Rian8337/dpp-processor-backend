import { Optional } from "@/types";
import { Accuracy, ModMap, SerializedMod } from "@rian8337/osu-base";
import { SliderCheeseInformation } from "@rian8337/osu-droid-replay-analyzer";

/**
 * A cloneable `Accuracy` object.
 */
export interface CloneableAccuracy {
    /**
     * The amount of 300s achieved.
     */
    n300: number;

    /**
     * The amount of 100s achieved.
     */
    n100: number;

    /**
     * The amount of 50s achieved.
     */
    n50: number;

    /**
     * The amount of misses achieved.
     */
    nmiss: number;
}

/**
 * Represents a parameter to alter calculation results that can be cloned
 * for specific purposes (i.e., passing data between worker threads).
 */
export interface CloneableCalculationParameters<
    TFromCalculation extends boolean = boolean,
> {
    /**
     * The mods to calculate for.
     */
    mods: SerializedMod[];

    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: CloneableAccuracy;

    /**
     * The number of slider ticks that were hit.
     */
    sliderTickHits?: number;

    /**
     * The number of slider ends that were hit.
     */
    sliderEndHits?: number;

    /**
     * The tap penalty to apply for penalized scores.
     */
    tapPenalty: Optional<TFromCalculation, number>;

    /**
     * The slider cheese penalties to apply for penalized scores.
     */
    sliderCheesePenalty: Optional<TFromCalculation, SliderCheeseInformation>;
}

/**
 * Represents a parameter to alter calculation result.
 */
export interface CalculationParametersInit {
    /**
     * The mods to calculate for.
     */
    mods?: ModMap;

    /**
     * The combo achieved. Defaults to the beatmap's maximum combo.
     */
    combo?: number;

    /**
     * The accuracy achieved. Defaults to SS.
     */
    accuracy?: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

    /**
     * The amount of slider ticks that were missed.
     */
    sliderTicksMissed?: number;

    /**
     * The amount of slider ends that were dropped.
     */
    sliderEndsDropped?: number;

    /**
     * The slider cheese penalties to apply for penalized scores. Each of them defaults to 1.
     */
    sliderCheesePenalty?: SliderCheeseInformation;
}
