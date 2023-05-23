import { FindOptions } from "mongodb";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";
import { IDPPBan } from "../../structures/elainaDb/IDPPBan";

/**
 * A manager for the `dppban` collection.
 */
export class DPPBanCollectionManager extends DatabaseCollectionManager<IDPPBan> {
    override get defaultDocument(): IDPPBan {
        return {
            uid: 0,
            reason: "",
        };
    }

    /**
     * Checks whether a uid is dpp-banned.
     *
     * @param uid The uid to check.
     * @returns Whether the uid is dpp-banned.
     */
    async isPlayerBanned(uid: number): Promise<boolean> {
        return !!(await this.getOne({ uid: uid }));
    }
}
