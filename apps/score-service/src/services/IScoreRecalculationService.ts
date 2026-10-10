export interface IScoreRecalculationService {
    /**
     * Recalculates one score with the live algorithm and updates the leaderboard and best score.
     *
     * @throws {RetryLaterError} If the beatmap service or broker asks to retry. Nothing is changed then.
     */
    recalculate(scoreId: number): Promise<void>;
}
