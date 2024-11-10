import { ScoreRank } from "@rian8337/osu-base";

/**
 * Represents an osu!droid score.
 */
export interface OfficialDatabaseScore {
    readonly id: number;
    readonly uid: number;
    readonly filename: string;
    readonly hash: string;
    readonly mode: string | null;
    readonly score: number;
    readonly combo: number;
    readonly mark: ScoreRank;
    readonly geki: number;
    readonly perfect: number;
    readonly katu: number;
    readonly good: number;
    readonly bad: number;
    readonly miss: number;
    readonly date: Date;
    readonly accuracy: number;
    readonly pp: number | null;
}
