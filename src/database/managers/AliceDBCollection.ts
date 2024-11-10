import { Db } from "mongodb";
import { RecentPlaysCollectionManager } from "./aliceDb/RecentPlaysCollectionManager";
import { InGamePPCollectionManager } from "./aliceDb/InGamePPCollectionManager";
import { AccountTransferCollectionManager } from "./aliceDb/AccountTransferCollectionManager";

/**
 * Contains collections from Alice DB.
 */
export class AliceDBCollection {
    /**
     * The database collection for account transfers.
     */
    readonly accountTransfer: AccountTransferCollectionManager;

    /**
     * The database collection for recent plays.
     */
    readonly recentPlays: RecentPlaysCollectionManager;

    /**
     * The database collection for in-game droid performance points (dpp) entries of osu!droid players.
     */
    readonly inGamePP: InGamePPCollectionManager;

    /**
     * @param aliceDb The database that is only used by this bot (my database).
     */
    constructor(aliceDb: Db) {
        this.accountTransfer = new AccountTransferCollectionManager(
            aliceDb.collection("accounttransfer"),
        );
        this.recentPlays = new RecentPlaysCollectionManager(
            aliceDb.collection("recentplays"),
        );
        this.inGamePP = new InGamePPCollectionManager(
            aliceDb.collection("ingamepp"),
        );
    }
}
