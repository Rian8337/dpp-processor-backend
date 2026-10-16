import { md5HashSchema, modsSchema } from "@dpp/shared";
import { Modes, RankedStatus } from "@rian8337/osu-base";
import { z } from "zod";

const count = z.int().nonnegative();

/**
 * The processor's resolved score. Loose: fields this service does not read are kept.
 */
export const resolvedScoreSchema = z.looseObject({
    n300: count,
    n100: count,
    n50: count,
    nmiss: count,
    combo: count,
    sliderTicksMissed: count.optional(),
    sliderEndsDropped: count.optional(),
    totalScore: count.optional(),
    tapPenalty: z.number(),
    sliderCheesePenalty: z.number(),
});

/**
 * A processor's performance response, as the broker returns it. Only the fields this service reads are checked;
 * the parsed object keeps everything else, so it can be passed through unchanged.
 */
export const performanceBodySchema = z.looseObject({
    difficulty: z.looseObject({ mods: modsSchema }),
    performance: z.looseObject({ total: z.number().nonnegative() }),
    score: resolvedScoreSchema,
    strainChart: z.string().optional(),
});

export type PerformanceBody = z.infer<typeof performanceBodySchema>;

export const replayPerformanceBodySchema = performanceBodySchema.extend({
    replay: z.looseObject({
        hitError: z.unknown(),
        sliderTickInformation: z.unknown(),
        sliderEndInformation: z.unknown(),
    }),
});

export type ReplayPerformanceBody = z.infer<typeof replayPerformanceBodySchema>;

export const variantSummarySchema = z.looseObject({
    name: z.string(),
    mode: z.enum(Modes).nullable(),
});

/**
 * `GET /getbeatmap` of the beatmap service (osu! API v1 format). Only these fields are used.
 */
export const beatmapMetadataSchema = z.looseObject({
    file_md5: md5HashSchema,
    artist: z.string(),
    title: z.string(),
    creator: z.string(),
    version: z.string(),
    // osu! API v1 sends the status as a string ("1"); RankedStatus has number members.
    approved: z
        .string()
        .regex(/^-?\d+$/)
        .transform(Number)
        .pipe(z.enum(RankedStatus)),
});
