import type { RecentPlayDocument } from "@/mongo/documents";
import type { IRecentPlayRepository } from "@/repositories/IRecentPlayRepository";

export class InMemoryRecentPlayRepository implements IRecentPlayRepository {
    readonly plays: RecentPlayDocument[] = [];
    fail: Error | null = null;

    insert(play: RecentPlayDocument) {
        if (this.fail) {
            return Promise.reject(this.fail);
        }

        this.plays.push(play);

        return Promise.resolve();
    }
}
