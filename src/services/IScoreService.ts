import { IBestScore, IScore } from "@/database/official/schema";
import { Score } from "@rian8337/osu-droid-utilities";

/**
 * Provides score related operations.
 */
export interface IScoreService {
    /**
     * Obtains the best score of a player in a beatmap in terms of score.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param forceDatabaseQuery Whether to force a database query.
     * @returns The score of the player in the beatmap, or `null` if not found.
     */
    getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: true,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | null>;

    /**
     * Obtains the best score of a player in a beatmap in terms of score.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param forceDatabaseQuery Whether to force a database query.
     * @returns The score of the player in the beatmap, or a `Score` object if found.
     */
    getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: false,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | Score | null>;

    /**
     * Obtains the best score of a player in a beatmap in terms of performance points.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param forceDatabaseQuery Whether to force a database query.
     * @returns The best score of the player in the beatmap, or `null` if not found.
     */
    getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: true,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | null>;

    /**
     * Obtains the best score of a player in a beatmap in terms of performance points.
     *
     * @param uid The ID of the player.
     * @param hash The MD5 hash of the beatmap.
     * @param forceDatabaseQuery Whether to force a database query.
     * @returns The best score of the player in the beatmap, or a `Score` object if found.
     */
    getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: false,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | Score | null>;
}
