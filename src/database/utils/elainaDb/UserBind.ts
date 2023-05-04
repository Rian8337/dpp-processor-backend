import { PPEntry } from "../../../structures/PPEntry";
import { DatabaseManager } from "../../managers/DatabaseManager";
import { IUserBind } from "../../structures/elainaDb/IUserBind";

/**
 * Represents a Discord user who has at least one osu!droid account binded.
 */
export class UserBind implements IUserBind {
    discordid: string;
    uid: number;
    username: string;
    pptotal: number;
    playc: number;
    pp: PPEntry[];
    previous_bind: number[];

    constructor(
        data: IUserBind = DatabaseManager.elainaDb?.collections.userBind
            .defaultDocument ?? {}
    ) {
        this.discordid = data.discordid;
        this.uid = data.uid;
        this.username = data.username;
        this.pptotal = data.pptotal;
        this.playc = data.playc;
        this.pp = data.pp ?? [];
        this.previous_bind = data.previous_bind ?? [];
    }
}
