import { IAccountTransfer } from "../../structures/aliceDb/IAccountTransfer";
import { DatabaseCollectionManager } from "../DatabaseCollectionManager";

/**
 * A manager for the `accounttransfer` collection.
 */
export class AccountTransferCollectionManager extends DatabaseCollectionManager<IAccountTransfer> {
    get defaultDocument(): IAccountTransfer {
        return {
            discordId: "",
            transferList: [],
            transferUid: 0,
        };
    }
}
