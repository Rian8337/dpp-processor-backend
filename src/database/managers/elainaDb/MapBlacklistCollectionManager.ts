import { IMapBlacklist } from "../../structures/elainaDb/IMapBlacklist";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { Collection } from "mongodb";

/**
 * A manager for the `mapblacklist` collection.
 */
export class MapBlacklistCollectionManager extends DatabaseCollectionManager<IMapBlacklist> {
    override get defaultDocument(): IMapBlacklist {
        return {
            beatmapID: 0,
            reason: "",
        };
    }

    /**
     * @param collection The MongoDB collection.
     */
    constructor(collection: Collection<IMapBlacklist>) {
        super(collection);
    }
}
