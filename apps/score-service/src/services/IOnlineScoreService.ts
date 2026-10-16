import type { OnlineScoreQuery, OnlineScoreResponse } from "@dpp/shared";

export interface IOnlineScoreService {
    /** @throws {ScoreNotFoundError} | {UpstreamError} */
    lookup(query: OnlineScoreQuery): Promise<OnlineScoreResponse>;
}
