/**
 * The base of database difficulty attributes.
 */
export interface ProcessorDatabaseDifficultyAttributes {
    /**
     * The ID of the beatmap.
     */
    readonly beatmap_id: number;

    /**
     * The speed multiplier of the difficulty attributes.
     */
    readonly speed_multiplier: number;

    /**
     * The force CS used in the beatmap.
     *
     * If -1, no force CS is used.
     */
    readonly force_cs: number;

    /**
     * The force AR used in the beatmap.
     *
     * If -1, no force AR is used.
     */
    readonly force_ar: number;

    /**
     * The force OD used in the beatmap.
     *
     * If -1, no force OD is used.
     */
    readonly force_od: number;

    /**
     * Whether the difficulty attributes uses old statistics (pre-1.6.8 pre-release).
     */
    readonly old_statistics: 0 | 1;

    /**
     * The combined star rating of all skills.
     */
    readonly star_rating: number;

    /**
     * The maximum achievable combo.
     */
    readonly max_combo: number;

    /**
     * The difficulty corresponding to the aim skill.
     */
    readonly aim_difficulty: number;

    /**
     * The difficulty corresponding to the flashlight skill.
     */
    readonly flashlight_difficulty: number;

    /**
     * The number of clickable objects weighted by difficulty.
     *
     * Related to speed/tap difficulty.
     */
    readonly speed_note_count: number;

    /**
     * Describes how much of aim difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of aim difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of aim difficulty is contributed by sliders.
     */
    readonly slider_factor: number;

    /**
     * The overall clock rate that was applied to the beatmap.
     */
    readonly clock_rate: number;

    /**
     * The perceived approach rate inclusive of rate-adjusting mods (DT/HT/etc).
     *
     * Rate-adjusting mods don't directly affect the approach rate difficulty value, but have a perceived effect as a result of adjusting audio timing.
     */
    readonly approach_rate: number;

    /**
     * The perceived overall difficulty inclusive of rate-adjusting mods (DT/HT/etc), based on osu!standard judgement.
     *
     * Rate-adjusting mods don't directly affect the overall difficulty value, but have a perceived effect as a result of adjusting audio timing.
     */
    readonly overall_difficulty: number;

    /**
     * The number of hitcircles in the beatmap.
     */
    readonly hit_circle_count: number;

    /**
     * The number of sliders in the beatmap.
     */
    readonly slider_count: number;

    /**
     * The number of spinners in the beatmap.
     */
    readonly spinner_count: number;
}

/**
 * The primary key of database difficulty attributes.
 */
export type DatabaseDifficultyAttributesPrimaryKey = Pick<
    ProcessorDatabaseDifficultyAttributes,
    | "beatmap_id"
    | "speed_multiplier"
    | "force_cs"
    | "force_ar"
    | "force_od"
    | "old_statistics"
>;
