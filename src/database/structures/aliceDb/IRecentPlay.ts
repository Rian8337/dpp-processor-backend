import { HitErrorInformation } from "@rian8337/osu-droid-replay-analyzer";
import { CompleteCalculationAttributes } from "../../../structures/attributes/CompleteCalculationAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { DroidPerformanceAttributes } from "../../../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../../../structures/attributes/OsuPerformanceAttributes";
import { SliderTickInformation } from "../../../structures/SliderTickInformation";

/**
 * Represents a recent play.
 */
export interface IRecentPlay {
    /**
     * The uid of the player who submitted ths play.
     */
    uid: number;

    /**
     * The title of the beatmap in this play.
     */
    title: string;

    /**
     * The maximum combo achieved in this play.
     */
    combo: number;

    /**
     * The score achieved in this play.
     */
    score: number;

    /**
     * The rank achieved in this play.
     */
    rank: string;

    /**
     * The date of which this play was set.
     */
    date: Date;

    /**
     * The accuracy achieved in this play.
     */
    accuracy: {
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
    };

    /**
     * Enabled modifications in this play, in osu!standard string.
     */
    mods: string;

    /**
     * The MD5 hash of the beatmap in this play.
     */
    hash: string;

    /**
     * The speed multiplier of this play. Should default to 1.
     */
    speedMultiplier?: number;

    /**
     * The forced AR of this play.
     */
    forcedAR?: number;

    /**
     * Information about this play's hit error.
     */
    hitError?: HitErrorInformation;

    /**
     * Information about this play's slider tick collection.
     */
    sliderTickInformation?: SliderTickInformation;

    /**
     * Information about this play's slider end collection.
     */
    sliderEndInformation?: SliderTickInformation;

    /**
     * The osu!droid difficulty attributes of this play.
     */
    droidAttribs?: CompleteCalculationAttributes<
        DroidDifficultyAttributes,
        DroidPerformanceAttributes
    >;

    /**
     * The osu!standard difficulty attributes of this play.
     */
    osuAttribs?: CompleteCalculationAttributes<
        OsuDifficultyAttributes,
        OsuPerformanceAttributes
    >;
}
