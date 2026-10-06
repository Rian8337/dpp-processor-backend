import type { ResolvedScore, ScoreParameters } from "@dpp/shared";
import { Accuracy, MathUtils } from "@rian8337/osu-base";
import type {
    IDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { AlgorithmInputError } from "./errors";

/**
 * The difficulty attributes that limit a score. `maximumScore` exists only for osu!droid.
 */
export type ScoreLimits = Pick<
    IDifficultyAttributes,
    "maxCombo" | "hitCircleCount" | "sliderCount" | "spinnerCount"
> & {
    readonly maximumScore?: number;
};

/**
 * Applies defaults and limits to score parameters.
 *
 * - Missing hit counts default to a perfect play; `n300` defaults to the objects not otherwise accounted for.
 * - Objects not accounted for by explicit hit counts count as misses.
 * - Combo defaults to, and is clamped to, the maximum combo.
 * - Total score is clamped to the maximum score when there is one (osu!droid).
 * - Penalties default to 1 (no penalty).
 */
export function resolveScore(
    limits: ScoreLimits,
    score: ScoreParameters,
): ResolvedScore {
    const objectCount =
        limits.hitCircleCount + limits.sliderCount + limits.spinnerCount;

    const n100 = score.n100 ?? 0;
    const n50 = score.n50 ?? 0;
    const explicitMisses = score.nmiss ?? 0;
    const n300 =
        score.n300 ?? Math.max(0, objectCount - n100 - n50 - explicitMisses);
    const counted = n300 + n100 + n50 + explicitMisses;

    if (counted > objectCount) {
        throw new AlgorithmInputError(
            "INVALID_REQUEST",
            `Hit counts add up to ${counted.toString()}, but the beatmap has ${objectCount.toString()} objects`,
        );
    }

    const totalScore =
        score.totalScore !== undefined && limits.maximumScore !== undefined
            ? Math.min(score.totalScore, limits.maximumScore)
            : score.totalScore;

    return {
        n300,
        n100,
        n50,
        nmiss: explicitMisses + (objectCount - counted),
        combo: MathUtils.clamp(
            score.combo ?? limits.maxCombo,
            0,
            limits.maxCombo,
        ),
        ...(score.sliderTicksMissed !== undefined && {
            sliderTicksMissed: score.sliderTicksMissed,
        }),
        ...(score.sliderEndsDropped !== undefined && {
            sliderEndsDropped: score.sliderEndsDropped,
        }),
        ...(totalScore !== undefined && { totalScore }),
        tapPenalty: score.tapPenalty ?? 1,
        sliderCheesePenalty: score.sliderCheesePenalty ?? 1,
    };
}

/**
 * Converts a resolved score to performance calculator options.
 */
export function toCalculationOptions(
    score: ResolvedScore,
): PerformanceCalculationOptions {
    return {
        combo: score.combo,
        accPercent: new Accuracy({
            n300: score.n300,
            n100: score.n100,
            n50: score.n50,
            nmiss: score.nmiss,
        }),
        sliderTicksMissed: score.sliderTicksMissed,
        sliderEndsDropped: score.sliderEndsDropped,
        totalScore: score.totalScore,
        tapPenalty: score.tapPenalty,
        sliderCheesePenalty: score.sliderCheesePenalty,
    };
}
