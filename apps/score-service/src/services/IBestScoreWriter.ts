import type { ScoreColumns } from "@/official/types";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";

export interface BestScoreCandidate {
    /** The score's own columns, including its ID (the best row takes it). */
    readonly score: ScoreColumns;
    readonly pp: number;
    /** Stored on the best row as is. */
    readonly ppMultiplier: number;
    /** Stored as the best row's `filename`. */
    readonly title: string;
    /** Copied to the best folder when the candidate wins; null records the row without a replay. */
    readonly replay: Buffer | null;
}
export interface BestScoreOutcome {
    readonly changed: boolean;
    /** Best replays of rows this call deleted. Remove them with `removeReplays` after the transaction commits. */
    readonly staleReplayIds: readonly number[];
}
export interface IBestScoreWriter {
    /** Applies the one-best-per-beatmap rule in the caller's transaction (`repository` must be bound to it). Throws RetryLaterError when the current best cannot be recalculated now. */
    consider(
        repository: IOfficialScoreRepository,
        candidate: BestScoreCandidate,
    ): Promise<BestScoreOutcome>;
    removeReplays(ids: readonly number[]): Promise<void>;
}
