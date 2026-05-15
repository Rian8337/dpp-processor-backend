import { UpdateResult } from "mongodb";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { IDanCourseScore } from "../../structures/aliceDb/IDanCourseScore";

/**
 * A manager for the `dancourseleaderboard` collection.
 *
 * This collection is responsible for storing all highest scores of players that aren't flagged by 3f detection.
 */
export class DanCourseLeaderboardScoreCollectionManager extends DatabaseCollectionManager<IDanCourseScore> {
    get defaultDocument(): IDanCourseScore {
        return {
            bad: 0,
            date: Date.now(),
            geki: 0,
            good: 0,
            hash: "",
            katu: 0,
            maxCombo: 0,
            miss: 0,
            mods: [],
            perfect: 0,
            rank: "X",
            score: 0,
            uid: 0,
            username: "",
            grade: 0,
        };
    }

    /**
     * Gets the leaderboard of a beatmap.
     *
     * @param hash The MD5 hash of the beatmap.
     * @returns The top 50 leaderboard of the beatmap.
     */
    getLeaderboard(
        hash: string,
    ): Promise<
        Pick<
            IDanCourseScore,
            | "bad"
            | "good"
            | "maxCombo"
            | "miss"
            | "mods"
            | "perfect"
            | "rank"
            | "score"
            | "uid"
            | "username"
            | "grade"
        >[]
    > {
        return this.collection
            .find(
                { hash: hash },
                {
                    projection: {
                        _id: 0,
                        bad: 1,
                        good: 1,
                        grade: 1,
                        maxCombo: 1,
                        miss: 1,
                        mods: 1,
                        perfect: 1,
                        rank: 1,
                        score: 1,
                        uid: 1,
                        username: 1,
                    },
                },
            )
            .sort({ score: -1, date: -1, grade: -1 })
            .limit(50)
            .toArray();
    }

    /**
     * Gets a score from a player.
     *
     * @param uid The uid of the player.
     * @param hash The hash of the player.
     * @returns The score of the player, `null` if not found.
     */
    getScore(uid: number, hash: string): Promise<IDanCourseScore | null> {
        return this.getOne({ uid: uid, hash: hash });
    }

    /**
     * Adds or updates a score from a player.
     *
     * @param score The score of the player.
     * @returns Whether the operation succeeded.
     */
    updateScore(score: IDanCourseScore): Promise<UpdateResult> {
        return this.updateOne(
            { uid: score.uid, hash: score.hash },
            { $set: score },
            { upsert: true },
        );
    }
}
