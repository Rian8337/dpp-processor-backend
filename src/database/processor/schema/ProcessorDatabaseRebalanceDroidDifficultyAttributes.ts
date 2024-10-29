import { ProcessorDatabaseDifficultyAttributes } from "./ProcessorDatabaseDifficultyAttributes";

/**
 * Represents rebalance osu!droid difficulty attributes that are in the processor's database.
 */
export interface ProcessorDatabaseRebalanceDroidDifficultyAttributes
    extends ProcessorDatabaseDifficultyAttributes {
    /**
     * The mods which were applied to the beatmap.
     */
    readonly mods: string;

    /**
     * The difficulty corresponding to the tap skill.
     */
    readonly tap_difficulty: number;

    /**
     * The difficulty corresponding to the rhythm skill.
     */
    readonly rhythm_difficulty: number;

    /**
     * The difficulty corresponding to the visual skill.
     */
    readonly visual_difficulty: number;

    /**
     * The amount of strains that are considered difficult with respect to the tap skill.
     */
    readonly tap_difficult_strain_count: number;

    /**
     * The amount of strains that are considered difficult with respect to the flashlight skill.
     */
    readonly flashlight_difficult_strain_count: number;

    /**
     * The amount of strains that are considered difficult with respect to the visual skill.
     */
    readonly visual_difficult_strain_count: number;

    /**
     * The average delta time of speed objects.
     */
    readonly average_speed_delta_time: number;

    /**
     * Describes how much of tap difficulty is contributed by notes that are "vibroable".
     *
     * A value closer to 1 indicates most of tap difficulty is contributed by notes that are not "vibroable".
     *
     * A value closer to 0 indicates most of tap difficulty is contributed by notes that are "vibroable".
     */
    readonly vibro_factor: number;

    /**
     * Possible sections at which the player can use three fingers on.
     *
     * The sections are divided by whitespace, where each section is separated in such structure:
     * `{firstObjectIndex} {lastObjectIndex} {sumStrain}`.
     */
    readonly possible_three_fingered_sections: string;

    /**
     * Sliders that are considered difficult.
     *
     * The sliders are divided by whitespace, where each slider is separated in such structure:
     * `{index} {difficultyRating}`.
     */
    readonly difficult_sliders: string;

    /**
     * The number of clickable objects weighted by difficulty.
     *
     * Related to aim difficulty.
     */
    readonly aim_note_count: number;

    /**
     * Describes how much of flashlight difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of flashlight difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of flashlight difficulty is contributed by sliders.
     */
    readonly flashlight_slider_factor: number;

    /**
     * Describes how much of visual difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of visual difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of visual difficulty is contributed by sliders.
     */
    readonly visual_slider_factor: number;
}
