import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { IUserBind } from "../../structures/elainaDb/IUserBind";

/**
 * A manager for the `userbind` collection.
 */
export class UserBindCollectionManager extends DatabaseCollectionManager<IUserBind> {
    override get defaultDocument(): IUserBind {
        return {
            discordid: "",
            uid: 0,
            username: "",
        };
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
                },
            },
        );
    }
}
