import type { IBeatmapServiceClient } from "@/clients/IBeatmapServiceClient";
import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { scoreColumns } from "@/official/types";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IReplayStore } from "@/replays/IReplayStore";
import { requireValue } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IBestScoreWriter } from "./IBestScoreWriter";
import type { IScoreCalculator } from "./IScoreCalculator";
import type { IScoreRecalculationService } from "./IScoreRecalculationService";
import { effectiveMultiplier } from "./ppMultiplier";
import { noPPReason } from "./rankedStatus";

@Injectable(dependencyTokens.scoreRecalculationService)
export class ScoreRecalculationService implements IScoreRecalculationService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly beatmaps: IBeatmapServiceClient,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.bestScoreWriter)
        private readonly bestScores: IBestScoreWriter,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.cliConfig) private readonly config: CliConfig,
    ) {}

    /**
     * @throws {RetryLaterError} If the beatmap service or broker asks to retry. Database errors are thrown as is.
     */
    async recalculate(scoreId: number): Promise<void> {
        const score = await this.official.findScoreById(scoreId);

        if (!score) {
            return;
        }

        if (score.score === 0) {
            await this.invalidate(scoreId, "score value 0");
            return;
        }

        const beatmap = requireValue(
            await this.beatmaps.getBeatmap("bulk", score.hash),
        );

        if (!beatmap) {
            await this.invalidate(scoreId, "beatmap not found");
            return;
        }

        const reason = noPPReason(beatmap);

        if (reason) {
            await this.invalidate(scoreId, reason);
            return;
        }

        const calculation = await this.calculator.calculateStats(
            this.config.variants.liveDroid,
            score,
        );
        const result = requireValue(calculation);

        if (!result && !calculation.ok) {
            console.log(
                `Cleared pp of score ${scoreId.toString()}: calculation rejected (${calculation.code})`,
            );
        }
        const replay = result
            ? await this.replays.readScoreReplay("online", scoreId)
            : null;

        const stale = await this.official.transaction(async (repository) => {
            if (!result) {
                await repository.setScorePP(scoreId, null);
                return [];
            }

            const pp =
                result.performance.total *
                effectiveMultiplier(score.ppMultiplier);

            await repository.setScorePP(scoreId, pp);

            const outcome = await this.bestScores.consider(repository, {
                score: scoreColumns(score),
                pp,
                ppMultiplier: score.ppMultiplier ?? 1,
                title: beatmap.title,
                replay,
            });

            return outcome.staleReplayIds;
        });

        await this.bestScores.removeReplays(stale);
    }

    private invalidate(scoreId: number, reason: string): Promise<void> {
        console.log(`Invalidated score ${scoreId.toString()}: ${reason}`);

        return this.official.transaction(async (repository) => {
            await repository.setScorePP(scoreId, null);
            await repository.setBestScorePP(scoreId, 0);
        });
    }
}
