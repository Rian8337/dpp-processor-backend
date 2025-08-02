import { IScore } from "@/database/official/schema";
import { ReplayData } from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";

/**
 * Provides replay related operations.
 */
export interface IReplayService {
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

    /**
     * Checks a replay's validity against its score.
     *
     * @param score The score to check against.
     * @param data The replay data to validate.
     * @returns `true` if the replay is valid, `false` otherwise.
     */
    isReplayValid(score: IScore | Score, data: ReplayData): boolean;
}
