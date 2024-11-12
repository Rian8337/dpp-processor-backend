import { Db } from "mongodb";
import { UserBindCollectionManager } from "./elainaDb/UserBindCollectionManager";

/**
 * Contains collections from Elaina DB.
 */
export class ElainaDBCollection {
    /**
     * The database collection for Discord users who have their osu!droid account(s) binded.
     */
    readonly userBind: UserBindCollectionManager;

    /**
     * @param elainaDb The database that is shared with the old bot (Nero's database).
     */
    constructor(elainaDb: Db) {
        this.userBind = new UserBindCollectionManager(
            elainaDb.collection("userbind"),
        );
    }
}
