import type { OfficialTables } from "./schema";

export type ScoreRow = OfficialTables["scores"]["$inferSelect"];
export type BestScoreRow = OfficialTables["bestScores"]["$inferSelect"];
export type BestScoreInsert = OfficialTables["bestScores"]["$inferInsert"];
export type UncalculatedScoreRow =
    OfficialTables["uncalculatedScores"]["$inferSelect"];

/**
 * What a calculation from stored stats reads. `totalScore` (the generated `round(score × score_multiplier)`) is sent
 * as the processor's `totalScore`, as the game sends `total_score` to `/calculate-score`.
 */
export type ScoreStats = Pick<
    ScoreRow,
    | "hash"
    | "mods"
    | "totalScore"
    | "combo"
    | "perfect"
    | "good"
    | "bad"
    | "miss"
    | "sliderHeadHit"
    | "sliderTickHit"
    | "sliderRepeatHit"
    | "sliderEndHit"
>;

/**
 * A score's own columns: a best row without `pp`, `ppMultiplier`, `filename` (the title), and the generated
 * `totalScore`. An uncalculated row has exactly these, minus `id`.
 */
export type ScoreColumns = Omit<
    BestScoreRow,
    "pp" | "ppMultiplier" | "filename" | "totalScore"
>;

export interface UserTotals {
    readonly pp: number;
    readonly accuracy: number;
}

/**
 * A score's own columns, for building a best row from it.
 */
export function scoreColumns(row: ScoreRow | BestScoreRow): ScoreColumns {
    const {
        pp: _pp,
        ppMultiplier: _ppMultiplier,
        filename: _filename,
        totalScore: _totalScore,
        ...columns
    } = row;

    return columns;
}
