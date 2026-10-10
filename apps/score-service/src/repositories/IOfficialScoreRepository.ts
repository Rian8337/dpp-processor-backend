import type {
    BestScoreInsert,
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
    UserTotals,
} from "@/official/types";

export interface IOfficialScoreRepository {
    /**
     * Runs `work` in one transaction with a repository bound to it. Nested calls use a savepoint.
     */
    transaction<T>(
        work: (repository: IOfficialScoreRepository) => Promise<T>,
    ): Promise<T>;
    findScoreById(id: number): Promise<ScoreRow | null>;
    findScore(uid: number, hash: string): Promise<ScoreRow | null>;
    /**
     * Every best row for the player and beatmap, highest pp first (more than one only for old duplicates).
     */
    findBestScores(uid: number, hash: string): Promise<BestScoreRow[]>;
    findUncalculatedScore(
        replayFilename: string,
    ): Promise<UncalculatedScoreRow | null>;
    deleteUncalculatedScore(replayFilename: string): Promise<void>;
    findUserId(username: string): Promise<number | null>;
    findUserLastLogin(
        uid: number,
    ): Promise<{ lastLoginTime: Date | null } | null>;
    /**
     * `SELECT … FOR UPDATE` on the user's row: serializes best-score writes for one player. Only meaningful in a
     * transaction.
     */
    lockUser(uid: number): Promise<void>;
    setScorePP(id: number, pp: number | null): Promise<void>;
    setBestScorePP(id: number, pp: number): Promise<void>;
    /**
     * Deletes the player's best rows for the beatmap, except `keepId`. Returns the deleted IDs.
     */
    deleteBestScores(
        uid: number,
        hash: string,
        keepId?: number,
    ): Promise<number[]>;
    insertBestScore(row: BestScoreInsert): Promise<void>;
    /**
     * The player's best rows' pp and accuracy, highest pp first.
     */
    topBestScores(
        uid: number,
        limit: number,
    ): Promise<{ pp: number; accuracy: number }[]>;
    setUserTotals(uid: number, totals: UserTotals): Promise<void>;
}
