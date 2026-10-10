import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { BestScoreRow } from "@/official/types";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IReplayStore } from "@/replays/IReplayStore";
import { requireValue } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type {
    BestScoreCandidate,
    BestScoreOutcome,
    IBestScoreWriter,
} from "./IBestScoreWriter";
import type { IScoreCalculator } from "./IScoreCalculator";
import { effectiveMultiplier } from "./ppMultiplier";

@Injectable(dependencyTokens.bestScoreWriter)
export class BestScoreWriter implements IBestScoreWriter {
    constructor(
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async consider(
        repository: IOfficialScoreRepository,
        candidate: BestScoreCandidate,
    ): Promise<BestScoreOutcome> {
        const { uid, hash } = candidate.score;

        // Serializes best-score writes for this player across processes, so two writers never both see no best.
        await repository.lockUser(uid);

        const [current] = await repository.findBestScores(uid, hash);

        if (current === undefined) {
            return this.record(repository, candidate);
        }

        const currentPP = await this.recalculate(current);

        if (candidate.pp > currentPP) {
            return this.record(repository, candidate);
        }

        if (currentPP !== current.pp) {
            await repository.setBestScorePP(current.id, currentPP);
        }

        const duplicates = await repository.deleteBestScores(
            uid,
            hash,
            current.id,
        );

        return {
            changed: false,
            staleReplayIds: duplicates.filter(
                (deletedId) => deletedId !== current.id,
            ),
        };
    }

    async removeReplays(ids: readonly number[]): Promise<void> {
        for (const id of ids) {
            await this.replays.deleteBestReplay(id);
        }
    }

    /**
     * Replaces every best row of the player and beatmap with the candidate.
     */
    private async record(
        repository: IOfficialScoreRepository,
        candidate: BestScoreCandidate,
    ): Promise<BestScoreOutcome> {
        const { id, uid, hash } = candidate.score;
        const deleted = await repository.deleteBestScores(uid, hash);

        await repository.insertBestScore({
            ...candidate.score,
            filename: candidate.title,
            pp: candidate.pp,
            ppMultiplier: candidate.ppMultiplier,
        });

        if (candidate.replay) {
            await this.replays.writeBestReplay(id, candidate.replay);
        } else {
            console.log(
                `[score-service] Best score ${id.toString()} recorded, but score ${id.toString()} has no replay`,
            );
        }

        return {
            changed: true,
            staleReplayIds: deleted.filter((deletedId) => deletedId !== id),
        };
    }

    /**
     * The current best's pp with today's algorithm, or its stored pp if it cannot be calculated.
     *
     * @throws {RetryLaterError} If the broker asks to retry.
     */
    private async recalculate(current: BestScoreRow): Promise<number> {
        const result = requireValue(
            await this.calculator.calculateStats(
                this.config.variants.liveDroid,
                current,
            ),
        );

        return result
            ? result.performance.total *
                  effectiveMultiplier(current.ppMultiplier)
            : current.pp;
    }
}
