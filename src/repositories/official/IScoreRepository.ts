import { IBestScore, IScore } from "@/database/official/schema";

/**
 * Provides operations for interacting with scores in the official database.
 */
export interface IScoreRepository {
    /**
     * Obtains the best score of a player in a beatmap in terms of score.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param columns The specific columns to retrieve.
     * @returns The score of the player in the beatmap, or `null` if not found.
     */
    getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | null>;

    /**
     * Obtains the best score of a player in a beatmap in terms of performance points.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param columns The specific columns to retrieve.
     * @returns The best score of the player in the beatmap, or `null` if not found.
     */
    getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | null>;

    /**
     * Obtains the top scores of a player.
     *
     * @param uid The ID of the player.
     * @param limit The maximum number of scores to retrieve. Defaults to 100.
     * @param columns The specific columns to retrieve.
     * @returns The top scores of the player.
     */
    getUserTopScores<K extends keyof IBestScore>(
        uid: number,
        limit?: number,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K>[]>;

    /**
     * Updates the performance points (PP) value of a score.
     *
     * @param id The ID of the score.
     * @param pp The new performance points value.
     * @returns Whether the update was successful.
     */
    updateScorePPValue(id: number, pp: number | null): Promise<boolean>;

    /**
     * Updates the performance points (PP) value of a best score.
     *
     * @param id The ID of the score.
     * @param pp The new performance points value.
     * @returns Whether the update was successful.
     */
    updateBestScorePPValue(id: number, pp: number): Promise<boolean>;

    /**
     * Inserts a new best score into the database. If the score is a duplicate, all values of
     * the score except its ID and the player's ID will be updated.
     *
     * @param score The score.
     * @returns Whether the insertion was successful.
     */
    insertBestScore(score: IBestScore): Promise<boolean>;

    /**
     * Invalidates the performance points (PP) value of a score, both in terms of best score and best performance points.
     *
     * @param id The ID of the score.
     */
    invalidatePPValue(id: number): Promise<void>;
}
