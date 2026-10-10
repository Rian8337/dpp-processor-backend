import type { SerializedMod } from "@rian8337/osu-base";
import { z } from "zod";
import { modsSchema } from "./schemas";

/**
 * A variant name or alias, as the broker accepts it.
 */
export const variantNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/**
 * A beatmap MD5 hash in lowercase hex.
 */
export const md5HashSchema = z.string().regex(/^[0-9a-f]{32}$/);

const booleanString = z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true");

/**
 * The query of `GET /online-scores`.
 */
export const onlineScoreQuerySchema = z.strictObject({
    uid: z.string().regex(/^\d+$/).transform(Number).pipe(z.int().positive()),
    hash: md5HashSchema,
    variant: variantNameSchema,
    best: booleanString,
    strainChart: booleanString,
});

export type OnlineScoreQuery = z.infer<typeof onlineScoreQuerySchema>;

/**
 * The response of `GET /online-scores`. `calculation` is the processor's response unchanged.
 */
export interface OnlineScoreResponse {
    readonly score: {
        readonly id: number;
        readonly uid: number;
        readonly hash: string;
        readonly best: boolean;
    };
    readonly source: "replay" | "score";
    readonly ppMultiplier: number;
    readonly pp: number;
    readonly calculation: Record<string, unknown>;
}

/**
 * A non-negative integer sent as a form field (string) or JSON number.
 */
const formCount = z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.int().nonnegative());

const formNumber = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
    ])
    .pipe(z.number());

const modsJson = z.string().transform((value, context) => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        context.addIssue({ code: "custom", message: "mods is not JSON" });

        return z.NEVER;
    }
});

/**
 * The fields of the game's `POST /calculate-score`, in `pp-processor-node`'s names. Field values arrive as strings
 * (multipart or URL-encoded) or JSON values.
 */
export const calculateScoreFieldsSchema = z
    .object({
        hash: z
            .string()
            .regex(/^[0-9a-fA-F]{32}$/)
            .transform((value) => value.toLowerCase()),
        mods: modsJson.pipe(modsSchema),
        combo: formCount,
        perfect: formCount,
        good: formCount,
        bad: formCount,
        miss: formCount,
        total_score: formCount,
        slider_head_hit: formCount.optional(),
        slider_tick_hit: formCount.optional(),
        slider_repeat_hit: formCount.optional(),
        slider_end_hit: formCount.optional(),
        pp_multiplier: formNumber.pipe(z.number().positive().max(1)).default(1),
        variant: variantNameSchema.optional(),
    })
    .superRefine((fields, context) => {
        const given = [
            fields.slider_head_hit,
            fields.slider_tick_hit,
            fields.slider_repeat_hit,
            fields.slider_end_hit,
        ].filter((value) => value !== undefined).length;

        if (given !== 0 && given !== 4) {
            context.addIssue({
                code: "custom",
                message:
                    "slider_head_hit, slider_tick_hit, slider_repeat_hit, and slider_end_hit must be given together",
            });
        }
    })
    .transform((fields): CalculateScoreFields => ({
        hash: fields.hash,
        mods: fields.mods,
        combo: fields.combo,
        perfect: fields.perfect,
        good: fields.good,
        bad: fields.bad,
        miss: fields.miss,
        totalScore: fields.total_score,
        sliderHits:
            fields.slider_head_hit !== undefined &&
            fields.slider_tick_hit !== undefined &&
            fields.slider_repeat_hit !== undefined &&
            fields.slider_end_hit !== undefined
                ? {
                      head: fields.slider_head_hit,
                      tick: fields.slider_tick_hit,
                      repeat: fields.slider_repeat_hit,
                      end: fields.slider_end_hit,
                  }
                : null,
        ppMultiplier: fields.pp_multiplier,
        ...(fields.variant !== undefined && { variant: fields.variant }),
    }));

export interface CalculateScoreFields {
    readonly hash: string;
    readonly mods: SerializedMod[];
    readonly combo: number;
    readonly perfect: number;
    readonly good: number;
    readonly bad: number;
    readonly miss: number;
    readonly totalScore: number;
    readonly sliderHits: {
        readonly head: number;
        readonly tick: number;
        readonly repeat: number;
        readonly end: number;
    } | null;
    readonly ppMultiplier: number;
    readonly variant?: string;
}

/**
 * The text fields of the game's `POST /calculate-replay` (the replay itself is the `replayfile` file field).
 */
export const calculateReplayFieldsSchema = z.object({
    variant: variantNameSchema.optional(),
});

/**
 * The response of both game routes, as `pp-processor-node` answers. Both values are `null` on any failure.
 */
export interface GamePPResponse {
    readonly pp: number | null;
    readonly pp_multiplier: number | null;
}
