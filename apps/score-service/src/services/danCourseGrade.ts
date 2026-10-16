import type { DanCourseScore } from "@/mongo/documents";
import { Accuracy } from "@rian8337/osu-base";

/**
 * The grade a score earns for a dan course requirement; a higher grade is better (also for misses, as before).
 * An unknown requirement grades 0.
 */
export function danCourseGrade(
    requirementId: string,
    score: DanCourseScore,
): number {
    switch (requirementId) {
        case "score":
            return score.score;
        case "acc":
            return new Accuracy({
                n300: score.perfect,
                n100: score.good,
                n50: score.bad,
                nmiss: score.miss,
            }).value;
        case "combo":
            return score.maxCombo;
        case "m100":
            return score.good;
        case "m300":
            return score.perfect;
        case "m50":
            return score.bad;
        case "miss":
            return score.miss;
        case "rank":
            return rankGrade(score.rank);
        default:
            return 0;
    }
}

function rankGrade(rank: string): number {
    switch (rank) {
        case "XH":
            return 8;
        case "SH":
            return 7;
        case "X":
            return 6;
        case "S":
            return 5;
        case "A":
            return 4;
        case "B":
            return 3;
        case "C":
            return 2;
        default:
            return 1;
    }
}
