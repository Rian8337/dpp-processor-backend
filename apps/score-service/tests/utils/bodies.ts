/**
 * A processor's `/performance` response body, as the broker returns it.
 */
export function performanceBody(
    total: number,
    extra: Record<string, unknown> = {},
) {
    return {
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
    };
}

/**
 * A processor's `/performance/replay` response body.
 */
export function replayPerformanceBody(
    total: number,
    extra: Record<string, unknown> = {},
) {
    return performanceBody(total, {
        replay: {
            hitError: null,
            sliderTickInformation: null,
            sliderEndInformation: null,
        },
        ...extra,
    });
}
