/**
 * Represents an osu!droid score.
 */
export interface OfficialDatabaseScore {
    readonly id: number;
    readonly uid: number;
    readonly filename: string;
    readonly hash: string;
    readonly mode: string;
    readonly score: number;
    readonly combo: number;
    readonly mark: string;
    readonly geki: number;
    readonly perfect: number;
    readonly katu: number;
    readonly good: number;
    readonly bad: number;
    readonly miss: number;
    readonly date: Date;
    readonly accuracy: number;
}
