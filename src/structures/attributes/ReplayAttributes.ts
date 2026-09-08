import { HitErrorInformation, SliderNestedHitObjectInformation } from "@rian8337/osu-droid-replay-analyzer";

/**
 * Represents data of a calculated replay.
 */
export interface ReplayAttributes {
    /**
     * The hit error information of the replay.
     */
    readonly hitError?: HitErrorInformation;

    /**
     * Information about slider tick hits.
     */
    readonly sliderTickInformation: SliderNestedHitObjectInformation;

    /**
     * Information about slider end hits.
     */
    readonly sliderEndInformation: SliderNestedHitObjectInformation;
}
