import type { UserTotals } from "@/official/types";

/**
 * How many best scores count toward a player's totals.
 */
export const countedBestScores = 100;

/**
 * Total pp and accuracy from best scores sorted by pp descending, weighted 0.95^i. Accuracy 1 when empty.
 */
export function calculateUserTotals(
    scores: readonly { pp: number; accuracy: number }[],
): UserTotals {
    let pp = 0;
    let accuracy = 0;
    let weight = 0;

    for (const [i, score] of scores.slice(0, countedBestScores).entries()) {
        const multiplier = 0.95 ** i;

        pp += score.pp * multiplier;
        accuracy += score.accuracy * multiplier;
        weight += multiplier;
    }

    return { pp, accuracy: weight > 0 ? accuracy / weight : 1 };
}
