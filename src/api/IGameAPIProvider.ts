/**
 * Provides operations for interacting with the game API.
 */
export interface IGameAPIProvider {
    /**
     * Obtains the replay file of a score in terms of best score value.
     *
     * @param scoreId The ID of the score.
     * @returns The replay file as a Buffer.
     */
    getReplay(scoreId: number): Promise<Buffer>;

    /**
     * Obtains the replay file of a score in terms of best performance points (PP) value.
     *
     * @param scoreId The ID of the score.
     * @returns The replay file as a Buffer.
     */
    getBestReplay(scoreId: number): Promise<Buffer>;
}
