import { Collection } from "mongodb";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { IUserBind } from "../../structures/elainaDb/IUserBind";

/**
 * A manager for the `userbind` collection.
 */
export class UserBindCollectionManager extends DatabaseCollectionManager<IUserBind> {
    override get defaultDocument(): IUserBind {
        return {
            discordid: "",
            playc: 0,
            pp: [],
            pptotal: 0,
            previous_bind: [],
            uid: 0,
            weightedAccuracy: 0,
        };
    }

    /**
     * @param collection The MongoDB collection.
     */
    constructor(collection: Collection<IUserBind>) {
        super(collection);
    }

    /**
     * Gets the bind information of an osu!droid account from its uid.
     *
     * @param uid The uid of the osu!droid account.
     */
    getFromUid(uid: number): Promise<IUserBind | null> {
        return this.getOne(
            { previous_bind: { $all: [uid] } },
            {
                projection: {
                    _id: 0,
                    discordid: 1,
                    uid: 1,
                    pp: 1,
                    pptotal: 1,
                    playc: 1,
                },
            }
        );
    }
}
