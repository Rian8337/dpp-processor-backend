import { dependencyTokens } from "@/dependencies/tokens";
import { userBindSchema } from "@/mongo/documents";
import { Injectable } from "@dpp/server";
import type { Collection, Db, Document } from "mongodb";
import { inject } from "tsyringe";
import type { IUserBindRepository } from "./IUserBindRepository";

@Injectable(dependencyTokens.userBindRepository)
export class UserBindRepository implements IUserBindRepository {
    // Read only, and validated with `userBindSchema` on every read.
    private readonly collection: Collection<Document>;

    constructor(@inject(dependencyTokens.elainaDb) db: Db) {
        this.collection = db.collection("userbind");
    }

    async findDiscordId(uid: number): Promise<string | null> {
        // `previous_bind` lists every uid ever bound, including the current one.
        const document = await this.collection.findOne(
            { previous_bind: { $all: [uid] } },
            { projection: { _id: 0, discordid: 1 } },
        );
        const parsed = userBindSchema.safeParse(document);

        return parsed.success ? parsed.data.discordid : null;
    }
}
