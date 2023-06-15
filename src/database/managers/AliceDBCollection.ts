import { Db } from "mongodb";
import { RecentPlaysCollectionManager } from "./aliceDb/RecentPlaysCollectionManager";

/**
 * Contains collections from Alice DB.
 */
export class AliceDBCollection {
    /**
     * The database collection for recent plays.
     */
    readonly recentPlays: RecentPlaysCollectionManager;

    /**
     * @param aliceDb The database that is only used by this bot (my database).
     */
    constructor(aliceDb: Db) {
        this.recentPlays = new RecentPlaysCollectionManager(
            aliceDb.collection("recentplays")
        );
    }
}
