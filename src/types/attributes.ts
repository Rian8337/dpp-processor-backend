import {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    HitErrorInformation,
    SliderNestedHitObjectInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import { IDifficultyAttributes as IRebalanceDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";

//#region Difficulty Attributes

/**
 * A base difficulty attributes structure for all difficulty attributes.
 */
export type RawDifficultyAttributes =
    | IDifficultyAttributes
    | IRebalanceDifficultyAttributes;

/**
 * Difficulty attributes of a beatmap that were cached.
 */
export interface CachedDifficultyAttributes<T extends RawDifficultyAttributes> {
    /**
     * The ID of the beatmap.
     */
    readonly id: number;

    /**
     * The MD5 hash of the beatmap.
     */
    readonly hash: string;

    /**
     * The difficulty attributes of the beatmap, following the formatting rule:
     *
     * `"<serialized mods, ordered by localeCompare>": {}`
     */
    readonly difficultyAttributes: Map<
        string,
        CacheableDifficultyAttributes<T>
    >;
}

//#endregion

//#region Performance Attributes

/**
 * A structure containing information about a performance calculation result.
 */
export interface PerformanceAttributes {
    /**
     * Calculated score performance points.
     */
    total: number;

    /**
     * The aim performance points.
     */
    aim: number;

    /**
     * The accuracy performance points.
     */
    accuracy: number;

    /**
     * The flashlight performance points.
     */
    flashlight: number;
}

/**
 * A structure containing information about a performance calculation result.
 */
export interface DroidPerformanceAttributes extends PerformanceAttributes {
    /**
     * The tap performance points.
     */
    tap: number;

    /**
     * The visual performance points.
     */
    visual: number;

    /**
     * The estimated deviation of the score.
     */
    deviation: number;

    /**
     * The estimated tap deviation of the score.
     */
    tapDeviation: number;

    /**
     * The penalty used to penalize the tap performance value.
     */
    tapPenalty: number;

    /**
     * The penalty used to penalize the aim performance value.
     */
    aimSliderCheesePenalty: number;

    /**
     * The penalty used to penalize the flashlight performance value.
     */
    flashlightSliderCheesePenalty: number;

    /**
     * The penalty used to penalize the visual performance value.
     */
    visualSliderCheesePenalty: number;
}

/**
 * A structure containing information about a performance calculation result.
 */
export interface OsuPerformanceAttributes extends PerformanceAttributes {
    speed: number;
}

//#endregion

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
