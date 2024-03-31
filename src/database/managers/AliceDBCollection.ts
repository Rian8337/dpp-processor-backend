import { Db } from "mongodb";
import { RecentPlaysCollectionManager } from "./aliceDb/RecentPlaysCollectionManager";
import { PrototypePPCollectionManager } from "./aliceDb/PrototypePPCollectionManager";

/**
 * Contains collections from Alice DB.
 */
export class AliceDBCollection {
    /**
     * The database collection for recent plays.
     */
    readonly recentPlays: RecentPlaysCollectionManager;

    /**
     * The database collection for prototype droid performance point (dpp) entries of osu!droid players.
     */
    readonly prototypePP: PrototypePPCollectionManager;

    /**
     * @param aliceDb The database that is only used by this bot (my database).
     */
    constructor(aliceDb: Db) {
        this.recentPlays = new RecentPlaysCollectionManager(
            aliceDb.collection("recentplays")
        );
        this.prototypePP = new PrototypePPCollectionManager(
            aliceDb.collection("prototypepp")
        );
    }
}
