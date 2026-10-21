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

const sliderHitFields = [
    "sliderHeadHits",
    "sliderTickHits",
    "sliderRepeatHits",
    "sliderEndHits",
] as const;

/**
 * Score values that alter a performance calculation. Every field is optional.
 *
 * Slider hit counts (`sliderHeadHits`, `sliderTickHits`, `sliderRepeatHits`, `sliderEndHits`) are what the game
 * records; the processor converts them to `sliderTicksMissed` and `sliderEndsDropped` with the beatmap's object
 * counts. They are given all together or not at all, and never with the miss counts they replace.
 */
export const scoreParametersSchema = z
    .strictObject({
        n300: hitCount.optional(),
        n100: hitCount.optional(),
        n50: hitCount.optional(),
        nmiss: hitCount.optional(),
        combo: hitCount.optional(),
        sliderTicksMissed: hitCount.optional(),
        sliderEndsDropped: hitCount.optional(),
        sliderHeadHits: hitCount.optional(),
        sliderTickHits: hitCount.optional(),
        sliderRepeatHits: hitCount.optional(),
        sliderEndHits: hitCount.optional(),
        totalScore: hitCount.optional(),
        // A divisor of the tap performance, so at least 1.
        tapPenalty: z.number().min(1).optional(),
        // A multiplier of the slider performance, so in (0, 1].
        sliderCheesePenalty: z.number().positive().max(1).optional(),
    })
    .superRefine((score, context) => {
        const given = sliderHitFields.filter(
            (field) => score[field] !== undefined,
        );

        if (given.length === 0) {
            return;
        }

        if (given.length !== sliderHitFields.length) {
            context.addIssue({
                code: "custom",
                message:
                    "sliderHeadHits, sliderTickHits, sliderRepeatHits, and sliderEndHits must be given together",
            });

            return;
        }

        if (
            score.sliderTicksMissed !== undefined ||
            score.sliderEndsDropped !== undefined
        ) {
            context.addIssue({
                code: "custom",
                message:
                    "Slider hit counts cannot be combined with sliderTicksMissed or sliderEndsDropped",
            });
        }
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

/**
 * Changes to a variant. `null` clears `title` or `description`. Length limits are enforced by the broker.
 */
export const variantUpdateSchema = z
    .strictObject({
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        public: z.boolean().optional(),
        pinned: z.boolean().optional(),
    })
    .refine(
        (update) =>
            update.title !== undefined ||
            update.description !== undefined ||
            update.public !== undefined ||
            update.pinned !== undefined,
        {
            message:
                "Pass at least one of title, description, public, or pinned",
        },
    );

/**
 * Points an alias at a variant.
 */
export const aliasSetSchema = z.strictObject({ variant: z.string() });

/**
 * Sets or, with `null`, removes a user's role.
 */
export const roleSetSchema = z.strictObject({
    role: z.enum(["admin", "manager"]).nullable(),
});

const rateLimitPerMinute = z.number().int().positive().nullable();

/**
 * A new API key. `grants` are variant names; the broker checks that they exist.
 */
export const keyCreateSchema = z.strictObject({
    name: z.string(),
    rateLimitPerMinute,
    allVariants: z.boolean().default(false),
    canActForUsers: z.boolean().default(false),
    grants: z.array(z.string()).default([]),
});

/**
 * Changes to an API key.
 */
export const keyUpdateSchema = z
    .strictObject({
        rateLimitPerMinute: rateLimitPerMinute.optional(),
        allVariants: z.boolean().optional(),
        canActForUsers: z.boolean().optional(),
    })
    .refine(
        (update) =>
            update.rateLimitPerMinute !== undefined ||
            update.allVariants !== undefined ||
            update.canActForUsers !== undefined,
        {
            message:
                "Pass at least one of rateLimitPerMinute, allVariants, or canActForUsers",
        },
    );
