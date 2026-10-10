import type { SerializedMod } from "@rian8337/osu-base";
import { z } from "zod";

export interface CalculationParams {
    mods: SerializedMod[];
    accuracy: { n300: number; n100: number; n50: number; nmiss: number };
    combo: number;
    totalScore?: number;
    sliderTicksMissed?: number;
    sliderEndsDropped?: number;
    tapPenalty: number;
    sliderCheesePenalty: number;
}

export interface RecentPlayAttributes<TPerformance> {
    params: CalculationParams;
    difficulty: Record<string, unknown> & { mods: SerializedMod[] };
    performance: TPerformance;
}

export interface DroidRecentPerformance {
    total: number;
    aim: number;
    tap: number;
    accuracy: number;
    flashlight: number;
    reading: number;
    deviation: number;
    tapDeviation: number;
    tapPenalty: number;
    sliderCheesePenalty: number;
}

export interface OsuRecentPerformance {
    total: number;
    aim: number;
    speed: number;
    accuracy: number;
    flashlight: number;
}

/**
 * Unchanged from the old backend's `IRecentPlay`; the Discord bot reads it.
 */
export interface RecentPlayDocument {
    uid: number;
    title: string;
    combo: number;
    score: number;
    rank: string;
    date: Date;
    accuracy: { n300: number; n100: number; n50: number; nmiss: number };
    mods: SerializedMod[];
    hash: string;
    scoreId: number;
    hitError?: unknown;
    sliderTickInformation?: unknown;
    sliderEndInformation?: unknown;
    droidAttribs?: RecentPlayAttributes<DroidRecentPerformance>;
    osuAttribs?: RecentPlayAttributes<OsuRecentPerformance>;
}

/**
 * A dan course as read from `dancoursemaps`. Only the fields grading needs are checked; unknown requirement IDs are
 * kept (they grade 0, as before).
 */
export const danCourseSchema = z.looseObject({
    hash: z.string().min(1),
    requirement: z.looseObject({ id: z.string(), value: z.number() }),
});

export type DanCourse = z.infer<typeof danCourseSchema>;

/**
 * Unchanged from the old backend's `IDanCourseScore`.
 */
export interface DanCourseScore {
    uid: number;
    username: string;
    hash: string;
    mods: SerializedMod[];
    score: number;
    maxCombo: number;
    rank: string;
    geki: number;
    perfect: number;
    katu: number;
    good: number;
    bad: number;
    miss: number;
    date: number;
    grade: number;
}

export const userBindSchema = z.object({ discordid: z.string().min(1) });

/**
 * The part of a leaderboard entry grading reads. Entries are written by this service and by older code, so they are
 * checked rather than trusted.
 */
export const danCourseGradeSchema = z.object({ grade: z.number() });
