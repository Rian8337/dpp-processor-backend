import { Db } from "mongodb";
import { DanCourseCollectionManager } from "./aliceDb/DanCourseCollectionManager";
import { DanCourseLeaderboardScoreCollectionManager } from "./aliceDb/DanCourseLeaderboardCollectionManager";
import { RecentPlaysCollectionManager } from "./aliceDb/RecentPlaysCollectionManager";

/**
 * Contains collections from Alice DB.
 */
export class AliceDBCollection {
    /**
     * The database collection for dan courses.
     */
    readonly danCourses: DanCourseCollectionManager;

    /**
     * The database collection for dan course scores.
     */
    readonly danCourseLeaderboard: DanCourseLeaderboardScoreCollectionManager;

    /**
     * The database collection for recent plays.
     */
    readonly recentPlays: RecentPlaysCollectionManager;

    /**
     * @param aliceDb The database that is only used by this bot (my database).
     */
    constructor(aliceDb: Db) {
        this.danCourses = new DanCourseCollectionManager(
            aliceDb.collection("dancoursemaps"),
        );
        this.danCourseLeaderboard =
            new DanCourseLeaderboardScoreCollectionManager(
                aliceDb.collection("dancourseleaderboard"),
            );
        this.recentPlays = new RecentPlaysCollectionManager(
            aliceDb.collection("recentplays"),
        );
    }
}
