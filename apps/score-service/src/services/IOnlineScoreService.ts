import type { OnlineScoreQuery, OnlineScoreResponse } from "@dpp/shared";

export interface IOnlineScoreService {
    /**
     * @param query What to look up.
     * @param actingUid The person the lookup is made for, if any; the broker then only allows the variants they may use.
     * @throws {ScoreNotFoundError} | {UpstreamError}
     */
    lookup(
        query: OnlineScoreQuery,
        actingUid?: number,
    ): Promise<OnlineScoreResponse>;
}
