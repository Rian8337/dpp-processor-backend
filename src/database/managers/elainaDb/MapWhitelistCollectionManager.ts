import { IMapWhitelist } from "../../structures/elainaDb/IMapWhitelist";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { Collection, Filter, Sort } from "mongodb";

/**
 * A manager for the `mapwhitelist` command.
 */
export class MapWhitelistCollectionManager extends DatabaseCollectionManager<IMapWhitelist> {
    override get defaultDocument(): IMapWhitelist {
        return {
            diffstat: {
                cs: 0,
                ar: 0,
                od: 0,
                hp: 0,
                sr: 0,
                bpm: 0,
            },
            hashid: "",
            mapid: 0,
            mapname: "",
        };
    }

    /**
     * @param collection The MongoDB collection.
     */
    constructor(collection: Collection<IMapWhitelist>) {
        super(collection);
    }
}
