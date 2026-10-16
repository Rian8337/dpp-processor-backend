import type { ReplayPerformanceBody } from "@/clients/schemas";
import type {
    DroidRecentPerformance,
    OsuRecentPerformance,
    RecentPlayAttributes,
    RecentPlayDocument,
} from "@/mongo/documents";
import type { ParsedReplay } from "@/replays/parseReplay";
import { z } from "zod";

export interface RecentPlayInput {
    readonly uid: number;
    readonly scoreId: number;
    /** Must be v3 or later. */
    readonly replay: ParsedReplay;
    readonly title: string;
    readonly droid: ReplayPerformanceBody | null;
    readonly osu: ReplayPerformanceBody | null;
    readonly date: Date;
}

const droidPerformanceSchema = z.object({
    total: z.number(),
    aim: z.number(),
    tap: z.number(),
    accuracy: z.number(),
    flashlight: z.number(),
    reading: z.number(),
    deviation: z.number(),
    tapDeviation: z.number(),
    tapPenalty: z.number(),
    sliderCheesePenalty: z.number(),
});

const osuPerformanceSchema = z.object({
    total: z.number(),
    aim: z.number(),
    speed: z.number(),
    accuracy: z.number(),
    flashlight: z.number(),
});

/**
 * Builds the recent play document in the old backend's shape (`IRecentPlay`), which the Discord bot reads.
 * `z.object` strips the performance fields the old documents did not have.
 */
export function toRecentPlay(input: RecentPlayInput): RecentPlayDocument {
    const { replay } = input;
    const v3 = replay.v3!;
    const document: RecentPlayDocument = {
        uid: input.uid,
        title: input.title,
        combo: v3.maxCombo,
        score: v3.score,
        rank: replay.rank,
        date: input.date,
        accuracy: { ...replay.accuracy },
        mods: v3.mods,
        hash: replay.hash,
        scoreId: input.scoreId,
    };

    const droid =
        input.droid &&
        attributes<DroidRecentPerformance>(
            input.droid,
            droidPerformanceSchema,
            "droid",
        );

    if (droid && input.droid) {
        document.droidAttribs = droid;

        const { hitError, sliderTickInformation, sliderEndInformation } =
            input.droid.replay;

        if (hitError) {
            document.hitError = hitError;
        }

        if (sliderTickInformation) {
            document.sliderTickInformation = sliderTickInformation;
        }

        if (sliderEndInformation) {
            document.sliderEndInformation = sliderEndInformation;
        }
    }

    const osu =
        input.osu &&
        attributes<OsuRecentPerformance>(
            input.osu,
            osuPerformanceSchema,
            "osu",
        );

    if (osu) {
        document.osuAttribs = osu;
    }

    return document;
}

function attributes<T>(
    body: ReplayPerformanceBody,
    schema: z.ZodType<T>,
    mode: string,
): RecentPlayAttributes<T> | null {
    const performance = schema.safeParse(body.performance);

    if (!performance.success) {
        console.log(
            `Recent play: unexpected performance attributes for ${mode}; leaving them out`,
        );

        return null;
    }

    const { score } = body;

    return {
        params: {
            mods: body.difficulty.mods,
            accuracy: {
                n300: score.n300,
                n100: score.n100,
                n50: score.n50,
                nmiss: score.nmiss,
            },
            combo: score.combo,
            ...(score.totalScore !== undefined && {
                totalScore: score.totalScore,
            }),
            ...(score.sliderTicksMissed !== undefined && {
                sliderTicksMissed: score.sliderTicksMissed,
            }),
            ...(score.sliderEndsDropped !== undefined && {
                sliderEndsDropped: score.sliderEndsDropped,
            }),
            tapPenalty: score.tapPenalty,
            sliderCheesePenalty: score.sliderCheesePenalty,
        },
        difficulty: body.difficulty,
        performance: performance.data,
    };
}
