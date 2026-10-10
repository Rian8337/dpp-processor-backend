import type { RecentPlayDocument } from "@/mongo/documents";

export interface IRecentPlayRepository {
    insert(play: RecentPlayDocument): Promise<void>;
}
