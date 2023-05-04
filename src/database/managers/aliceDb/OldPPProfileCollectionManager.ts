import { Filter } from "mongodb";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { IOldPPProfile } from "../../structures/aliceDb/IOldPPProfile";

/**
 * A manager for the `playeroldpp` collection.
 */
export class OldPPProfileCollectionManager extends DatabaseCollectionManager<IOldPPProfile> {
    override get defaultDocument(): IOldPPProfile {
        return {
            discordId: "",
            uid: 0,
            username: "",
            playc: 0,
            pptotal: 0,
            weightedAccuracy: 0,
            pp: [],
            previous_bind: [],
        };
    }

    /**
     * Gets the bind information of an osu!droid account from its uid.
     *
     * @param uid The uid of the osu!droid account.
     */
    getFromUid(uid: number): Promise<IOldPPProfile | null> {
        return this.getOne(
            { previous_bind: { $all: [uid] } },
            {
                projection: {
                    _id: 0,
                    uid: 1,
                    username: 1,
                    pp: 1,
                    pptotal: 1,
                    playc: 1,
                },
            }
        );
    }
}
