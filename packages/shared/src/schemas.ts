import type { SerializedMod } from "@rian8337/osu-base";
import { z } from "zod";

/**
 * A mod in osu-base's serialized form. Whether the acronym is a known mod is checked by the processor.
 */
export const serializedModSchema = z.strictObject({
    acronym: z.string().min(1),
    settings: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<SerializedMod>;

/**
 * A list of mods, shared by every request that takes mods.
 */
export const modsSchema = z.array(serializedModSchema);

/**
 * Identifies a beatmap by ID, MD5 hash, or `.osu` file contents.
 */
export const beatmapReferenceSchema = z.union([
    z.strictObject({ id: z.number().int().positive() }),
    z.strictObject({ hash: z.string().regex(/^[0-9a-f]{32}$/) }),
    z.strictObject({ file: z.string().min(1) }),
]);

const hitCount = z.number().int().nonnegative();

/**
 * Score values that alter a performance calculation. Every field is optional.
 */
export const scoreParametersSchema = z.strictObject({
    n300: hitCount.optional(),
    n100: hitCount.optional(),
    n50: hitCount.optional(),
    nmiss: hitCount.optional(),
    combo: hitCount.optional(),
    sliderTicksMissed: hitCount.optional(),
    sliderEndsDropped: hitCount.optional(),
    totalScore: hitCount.optional(),
    tapPenalty: z.number().positive().optional(),
    sliderCheesePenalty: z.number().positive().optional(),
});

export const difficultyRequestSchema = z.strictObject({
    beatmap: beatmapReferenceSchema,
    mods: modsSchema.default([]),
    strainChart: z.boolean().default(false),
});

export const performanceRequestSchema = z.strictObject({
    beatmap: beatmapReferenceSchema,
    mods: modsSchema.default([]),
    score: scoreParametersSchema.default({}),
    strainChart: z.boolean().default(false),
});

/**
 * `mods` and `score` override what the replay records. `mods` is required for replays that do not record their
 * mods (versions 1 and 2).
 */
export const replayPerformanceRequestSchema = z.strictObject({
    replay: z.base64().min(1),
    mods: modsSchema.optional(),
    score: scoreParametersSchema.optional(),
    strainChart: z.boolean().default(false),
});
