import { IInGamePP } from "../../structures/aliceDb/IInGamePP";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

/**
 * A manager for the `ingamepp` collection.
 */
export class InGamePPCollectionManager extends DatabaseCollectionManager<IInGamePP> {
    override get defaultDocument(): IInGamePP {
        return {
            discordid: "",
            lastUpdate: Date.now(),
            playc: 0,
            pp: [],
            pptotal: 0,
            prevpptotal: 0,
            uid: 0,
            previous_bind: [],
            username: "",
        };
    }

    /**
     * Gets the bind information of an osu!droid account from its uid.
     *
     * @param uid The uid of the osu!droid account.
     */
    getFromUid(uid: number): Promise<IInGamePP | null> {
        return this.getOne(
            { previous_bind: { $all: [uid] } },
            {
                projection: {
                    _id: 0,
                    discordid: 1,
                    uid: 1,
                    pp: 1,
                    playc: 1,
                },
            },
        );
    }
}
