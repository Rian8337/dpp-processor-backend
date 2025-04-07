import { SerializedMod } from "@rian8337/osu-base";
import {
    DifficultSlider,
    HighStrainSection,
} from "@rian8337/osu-difficulty-calculator";
import { doublePrecision, integer, jsonb } from "drizzle-orm/pg-core";

/**
 * The base columns for difficulty attributes.
 */
export const baseDifficultyAttributesColumns = {
    /**
     * The ID of the beatmap.
     */
    beatmapId: integer().notNull(),

    /**
     * The mods which were applied to the beatmap.
     */
    mods: jsonb().$type<SerializedMod[]>().notNull(),

    /**
     * The combined star rating of all skills.
     */
    starRating: doublePrecision().notNull(),

    /**
     * The maximum achievable combo.
     */
    maxCombo: integer().notNull(),

    /**
     * The difficulty corresponding to the aim skill.
     */
    aimDifficulty: doublePrecision().notNull(),

    /**
     * The difficulty corresponding to the flashlight skill.
     */
    flashlightDifficulty: doublePrecision().notNull(),

    /**
     * The number of clickable objects weighted by difficulty.
     *
     * Related to speed/tap difficulty.
     */
    speedNoteCount: doublePrecision().notNull(),

    /**
     * Describes how much of aim difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of aim difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of aim difficulty is contributed by sliders.
     */
    sliderFactor: doublePrecision().notNull(),

    /**
     * The overall clock rate that was applied to the beatmap.
     */
    clockRate: doublePrecision().notNull(),

    /**
     * The perceived overall difficulty inclusive of rate-adjusting mods (DT/HT/etc), based on osu!standard judgement.
     *
     * Rate-adjusting mods don't directly affect the overall difficulty value, but have a perceived effect as a result of adjusting audio timing.
     */
    overallDifficulty: doublePrecision().notNull(),

    /**
     * The number of hitcircles in the beatmap.
     */
    hitCircleCount: integer().notNull(),

    /**
     * The number of sliders in the beatmap.
     */
    sliderCount: integer().notNull(),

    /**
     * The number of spinners in the beatmap.
     */
    spinnerCount: integer().notNull(),

    /**
     * The amount of sliders weighed by difficulty.
     */
    aimDifficultSliderCount: doublePrecision().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the aim skill.
     */
    aimDifficultStrainCount: doublePrecision().notNull(),
} as const;

/**
 * The base columns for osu!droid difficulty attributes.
 */
export const baseDroidDifficultyAttributesColumns = {
    ...baseDifficultyAttributesColumns,
    /**
     * The difficulty corresponding to the tap skill.
     */
    tapDifficulty: doublePrecision().notNull(),

    /**
     * The difficulty corresponding to the rhythm skill.
     */
    rhythmDifficulty: doublePrecision().notNull(),

    /**
     * The difficulty corresponding to the visual skill.
     */
    visualDifficulty: doublePrecision().notNull(),

    /**
     * The number of clickable objects weighted by difficulty.
     *
     * Related to aim difficulty.
     */
    aimNoteCount: doublePrecision().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the tap skill.
     */
    tapDifficultStrainCount: doublePrecision().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the flashlight skill.
     */
    flashlightDifficultStrainCount: doublePrecision().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the visual skill.
     */
    visualDifficultStrainCount: doublePrecision().notNull(),

    /**
     * Describes how much of flashlight difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of flashlight difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of flashlight difficulty is contributed by sliders.
     */
    flashlightSliderFactor: doublePrecision().notNull(),

    /**
     * Describes how much of visual difficulty is contributed to by hitcircles or sliders.
     *
     * A value closer to 1 indicates most of visual difficulty is contributed by hitcircles.
     *
     * A value closer to 0 indicates most of visual difficulty is contributed by sliders.
     */
    visualSliderFactor: doublePrecision().notNull(),

    /**
     * Possible sections at which the player can use three fingers on.
     */
    possibleThreeFingeredSections: jsonb()
        .$type<HighStrainSection[]>()
        .notNull(),

    /**
     * Sliders that are considered difficult.
     */
    difficultSliders: jsonb().$type<DifficultSlider[]>().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the visual skill.
     */
    averageSpeedDeltaTime: doublePrecision().notNull(),

    /**
     * Describes how much of tap difficulty is contributed by notes that are "vibroable".
     *
     * A value closer to 1 indicates most of tap difficulty is contributed by notes that are not "vibroable".
     *
     * A value closer to 0 indicates most of tap difficulty is contributed by notes that are "vibroable".
     */
    vibroFactor: doublePrecision().notNull(),
} as const;

/**
 * The base columns for osu! difficulty attributes.
 */
export const baseOsuDifficultyAttributesColumns = {
    ...baseDifficultyAttributesColumns,

    /**
     * The difficulty corresponding to the speed skill.
     */
    speedDifficulty: doublePrecision().notNull(),

    /**
     * The perceived approach rate inclusive of rate-adjusting mods (DT/HT/etc).
     *
     * Rate-adjusting mods don't directly affect the approach rate difficulty value, but have a perceived effect as a result of adjusting audio timing.
     */
    approachRate: doublePrecision().notNull(),

    /**
     * The amount of strains that are considered difficult with respect to the speed skill.
     */
    speedDifficultStrainCount: doublePrecision().notNull(),
} as const;

/**
 * The primary key columns for difficulty attributes.
 */
export type DifficultyAttributesPrimaryKey = keyof Pick<
    typeof baseDifficultyAttributesColumns,
    "beatmapId" | "mods"
>;
