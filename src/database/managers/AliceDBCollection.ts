import { Db } from "mongodb";
import { OldPPProfileCollectionManager } from "./aliceDb/OldPPProfileCollectionManager";

/**
 * Contains collections from Alice DB.
 */
export class AliceDBCollection {
    /**
     * The database collection for players' old dpp profiles.
     */
    readonly playerOldPPProfile: OldPPProfileCollectionManager;

    /**
     * @param aliceDb The database that is only used by this bot (my database).
     */
    constructor(aliceDb: Db) {
        this.playerOldPPProfile = new OldPPProfileCollectionManager(
            aliceDb.collection("playeroldpp")
        );
    }
}
