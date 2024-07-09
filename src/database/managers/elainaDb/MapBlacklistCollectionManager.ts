import { IMapBlacklist } from "../../structures/elainaDb/IMapBlacklist";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

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
}
