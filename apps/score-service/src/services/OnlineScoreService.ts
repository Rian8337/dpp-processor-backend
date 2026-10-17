import type { IBrokerClient } from "@/clients/IBrokerClient";
import type { PerformanceBody } from "@/clients/schemas";
import { dependencyTokens } from "@/dependencies/tokens";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IReplayStore } from "@/replays/IReplayStore";
import type { ReplayParser } from "@/replays/parseReplay";
import { isReplayValid, parseModsColumn } from "@/replays/replayValidity";
import { ScoreNotFoundError, UpstreamError } from "@/types/errors";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { OnlineScoreQuery, OnlineScoreResponse } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import type { IOnlineScoreService } from "./IOnlineScoreService";
import type { IScoreCalculator } from "./IScoreCalculator";
import { effectiveMultiplier } from "./ppMultiplier";

@Injectable(dependencyTokens.onlineScoreService)
export class OnlineScoreService implements IOnlineScoreService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.brokerClient)
        private readonly broker: IBrokerClient,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
    ) {}

    async lookup(
        query: OnlineScoreQuery,
        actingUid?: number,
    ): Promise<OnlineScoreResponse> {
        const { uid, hash, variant, best, strainChart } = query;
        const score = best
            ? ((await this.official.findBestScores(uid, hash))[0] ?? null)
            : await this.official.findScore(uid, hash);

        if (!score) {
            throw new ScoreNotFoundError();
        }

        const file = await this.readReplay(best ? "best" : "online", score.id);
        const replay = file ? await this.parse(file) : null;
        // A replay is only calculated when it agrees with the score's mods (or has none), so these are the mods used.
        const header = {
            id: score.id,
            uid,
            hash,
            best,
            mods: parseModsColumn(score.mods) ?? [],
        };

        if (file && replay && isReplayValid(score, replay)) {
            const result = await this.calculator.calculateReplay(
                variant,
                file,
                {
                    // Replays older than v3 do not record mods; take mods and stats from the score.
                    ...(!replay.v3 && { overrides: score }),
                    strainChart,
                    actingUid,
                },
            );

            return respond(header, "replay", 1, result);
        }

        const mode = await this.broker.variantMode(variant, actingUid);

        if (!mode.ok) {
            throw UpstreamError.from(mode);
        }

        const result = await this.calculator.calculateStats(variant, score, {
            strainChart,
            actingUid,
        });
        // pp_multiplier carries replay-based penalties of droid scores whose replay is gone.
        const multiplier =
            mode.value === Modes.Droid
                ? effectiveMultiplier(score.ppMultiplier)
                : 1;

        return respond(header, "score", multiplier, result);
    }

    /**
     * An unreadable replay counts as a missing one; other callers of the store still see the error.
     */
    private async readReplay(
        folder: "online" | "best",
        scoreId: number,
    ): Promise<Buffer | null> {
        try {
            return await this.replays.readScoreReplay(folder, scoreId);
        } catch (e) {
            console.warn(
                `Could not read the replay of score ${scoreId.toString()}: ${e instanceof Error ? e.message : String(e)}`,
            );

            return null;
        }
    }
}

function respond(
    score: OnlineScoreResponse["score"],
    source: OnlineScoreResponse["source"],
    ppMultiplier: number,
    result: UpstreamResult<PerformanceBody>,
): OnlineScoreResponse {
    if (!result.ok) {
        throw UpstreamError.from(result);
    }

    return {
        score,
        source,
        ppMultiplier,
        pp: result.value.performance.total * ppMultiplier,
        calculation: result.value,
    };
}
