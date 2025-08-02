/**
 * Provides operations for interacting with stored replays.
 */
export interface IReplayRepository {
    /**
     * Obtains the replay file of a score in terms of best score value.
     *
     * @param scoreId The ID of the score.
     * @returns The replay file.
     */
    getReplay(scoreId: number): Promise<Buffer>;

    /**
     * Obtains the replay file of a score in terms of best performance points (PP) value.
     *
     * @param scoreId The ID of the score.
     * @returns The replay file.
     */
    getBestReplay(scoreId: number): Promise<Buffer>;
}
