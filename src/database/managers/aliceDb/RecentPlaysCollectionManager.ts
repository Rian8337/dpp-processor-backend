import { IRecentPlay } from "../../structures/aliceDb/IRecentPlay";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

/**
 * A manager for the `recentplays` collection.
 */
export class RecentPlaysCollectionManager extends DatabaseCollectionManager<IRecentPlay> {
    override get defaultDocument(): IRecentPlay {
        return {
            accuracy: {
                n300: 0,
                n100: 0,
                n50: 0,
                nmiss: 0,
            },
            combo: 0,
            date: new Date(),
            hash: "",
            mods: [],
            rank: "",
            score: 0,
            uid: 0,
            title: "",
        };
    }
}
