import { Collection } from "mongodb";
import { IPrototypePP } from "../../structures/aliceDb/IPrototypePP";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

/**
 * A manager for the `prototypepp` collection.
 */
export class PrototypePPCollectionManager extends DatabaseCollectionManager<IPrototypePP> {
    override get defaultDocument(): IPrototypePP {
        return {
            discordid: "",
            playc: 0,
            pp: [],
            pptotal: 0,
            prevpptotal: 0,
            uid: 0,
            previous_bind: [],
            username: "",
        };
    }

    constructor(collection: Collection<IPrototypePP>) {
        super(collection);
    }

    /**
     * Gets the bind information of an osu!droid account from its uid.
     *
     * @param uid The uid of the osu!droid account.
     */
    getFromUid(uid: number): Promise<IPrototypePP | null> {
        return this.getOne(
            { previous_bind: { $all: [uid] } },
            {
                projection: {
                    _id: 0,
                    discordid: 1,
                    uid: 1,
                    pp: 1,
                },
            }
        );
    }
}
