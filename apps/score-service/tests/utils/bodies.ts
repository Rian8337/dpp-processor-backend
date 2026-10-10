import {
    performanceBodySchema,
    replayPerformanceBodySchema,
    type PerformanceBody,
    type ReplayPerformanceBody,
} from "@/clients/schemas";

/**
 * A processor's `/performance` response body, validated as the broker client validates it.
 */
export function performanceBody(
    total: number,
    extra: Record<string, unknown> = {},
): PerformanceBody {
    return performanceBodySchema.parse({
        difficulty: { mods: [], starRating: 5 },
        performance: { total, aim: 1 },
        score: {
            n300: 100,
            n100: 0,
            n50: 0,
            nmiss: 0,
            combo: 200,
            tapPenalty: 1,
            sliderCheesePenalty: 1,
        },
        ...extra,
    });
}

/**
 * A processor's `/performance/replay` response body, validated as the broker client validates it.
 */
export function replayPerformanceBody(
    total: number,
    extra: Record<string, unknown> = {},
): ReplayPerformanceBody {
    return replayPerformanceBodySchema.parse({
        ...performanceBody(total),
        replay: {
            hitError: null,
            sliderTickInformation: null,
            sliderEndInformation: null,
        },
        ...extra,
    });
}
