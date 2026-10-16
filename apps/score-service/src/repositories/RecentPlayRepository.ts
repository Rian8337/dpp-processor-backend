import { dependencyTokens } from "@/dependencies/tokens";
import type { RecentPlayDocument } from "@/mongo/documents";
import { Injectable } from "@dpp/server";
import type { Collection, Db } from "mongodb";
import { inject } from "tsyringe";
import type { IRecentPlayRepository } from "./IRecentPlayRepository";

@Injectable(dependencyTokens.recentPlayRepository)
export class RecentPlayRepository implements IRecentPlayRepository {
    private readonly collection: Collection<RecentPlayDocument>;

    constructor(@inject(dependencyTokens.aliceDb) db: Db) {
        this.collection = db.collection("recentplays");
    }

    async insert(play: RecentPlayDocument): Promise<void> {
        // `insertOne` adds `_id` to the object it is given; a copy keeps the caller's object unchanged.
        await this.collection.insertOne({ ...play });
    }
}
