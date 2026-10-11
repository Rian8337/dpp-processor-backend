import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IReplayStore } from "@/replays/IReplayStore";
import { TaskQueue } from "@/runtime/TaskQueue";
import { RetryLaterError } from "@/types/errors";
import { requireValue } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IBestScoreWriter } from "./IBestScoreWriter";
import type { IScoreCalculator } from "./IScoreCalculator";
import type {
    IUncalculatedReplayService,
    UncalculatedOutcome,
} from "./IUncalculatedReplayService";
import { ppMultiplierFrom } from "./ppMultiplier";
import { calculateUserTotals, countedBestScores } from "./userTotals";

/**
 * The game copies a replay into the uncalculated folder before its transaction inserts the row, so a file without a
 * row may just be waiting for that commit. Such a file is deleted only once it is older than this.
 */
const orphanGraceMs = 15 * 60 * 1000;

/**
 * Calculates the scores the game recorded without pp (`bbl_score_uncalculated` rows with their replay files).
 */
@Injectable(dependencyTokens.uncalculatedReplayService)
export class UncalculatedReplayService implements IUncalculatedReplayService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.bestScoreWriter)
        private readonly bestScores: IBestScoreWriter,
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async runPass(signal?: AbortSignal): Promise<void> {
        const files = await this.replays.list("uncalculated");

        if (files.length === 0 || signal?.aborted) {
            return;
        }

        console.log(
            `Calculating ${files.length.toString()} uncalculated replay(s)`,
        );

        await using queue = new TaskQueue(this.config.uncalculatedConcurrency);

        for (const fileName of files) {
            queue.add(fileName, async () => {
                if (!signal?.aborted) {
                    await this.processFile(fileName);
                }
            });
        }

        await queue.onIdle();
    }

    async processFile(fileName: string): Promise<UncalculatedOutcome> {
        try {
            const file = await this.replays.read("uncalculated", fileName);

            if (!file) {
                await this.official.deleteUncalculatedScore(fileName);
                console.log(
                    `Uncalculated replay ${fileName} is missing; removed its row`,
                );
                return "processed";
            }

            const calculated = await this.official.transaction((repository) =>
                this.calculate(repository, fileName, file),
            );

            if (calculated === "no row") {
                return await this.handleOrphan(fileName);
            }

            const stale = calculated;

            await this.replays.delete("uncalculated", fileName);
            await this.bestScores.removeReplays(stale);
            console.log(`Processed uncalculated replay ${fileName}`);

            return "processed";
        } catch (e) {
            console.error(
                `Keeping uncalculated replay ${fileName} for the next pass:`,
                e instanceof RetryLaterError ? e.message : e,
            );
            return "kept";
        }
    }

    /**
     * A replay file without a row: deleted if old enough, otherwise kept in case the game's transaction is pending.
     */
    private async handleOrphan(fileName: string): Promise<UncalculatedOutcome> {
        const modified = await this.replays.modifiedAt(
            "uncalculated",
            fileName,
        );

        if (modified && Date.now() - modified.getTime() < orphanGraceMs) {
            console.log(
                `Uncalculated replay ${fileName} has no row yet; keeping it for the next pass`,
            );
            return "kept";
        }

        await this.replays.delete("uncalculated", fileName);
        console.log(
            `Uncalculated replay ${fileName} has no row; deleted the file`,
        );

        return "processed";
    }

    /**
     * Everything that touches the official database, in one transaction. Returns best replays to delete after commit.
     */
    private async calculate(
        repository: IOfficialScoreRepository,
        fileName: string,
        file: Buffer,
    ): Promise<readonly number[] | "no row"> {
        const row = await repository.findUncalculatedScore(fileName);

        if (!row) {
            return "no row";
        }

        const leaderboard = await repository.findScore(row.uid, row.hash);

        if (!leaderboard) {
            await repository.deleteUncalculatedScore(fileName);
            return [];
        }

        const variant = this.config.variants.liveDroid;
        const body = requireValue(
            await this.calculator.calculateReplay(variant, file),
        );
        const noPenalty =
            body &&
            requireValue(
                await this.calculator.noPenaltyTotal(variant, row.hash, body),
            );
        const pp = body && noPenalty !== null ? body.performance.total : null;

        // Both rows describe the same play only if their score values match.
        if (row.score === leaderboard.score) {
            await repository.setScorePP(leaderboard.id, pp);
        }

        let stale: readonly number[] = [];

        if (pp !== null && noPenalty !== null) {
            const {
                replayfilename: _replayfilename,
                filename,
                ...columns
            } = row;
            const outcome = await this.bestScores.consider(repository, {
                score: { ...columns, id: leaderboard.id },
                pp,
                ppMultiplier: ppMultiplierFrom(pp, noPenalty),
                title: filename,
                replay: file,
            });

            if (outcome.changed) {
                await repository.setUserTotals(
                    row.uid,
                    calculateUserTotals(
                        await repository.topBestScores(
                            row.uid,
                            countedBestScores,
                        ),
                    ),
                );
            }

            stale = outcome.staleReplayIds;
        }

        await repository.deleteUncalculatedScore(fileName);

        return stale;
    }
}
