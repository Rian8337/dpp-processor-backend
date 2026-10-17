import type { PerformanceBody, ReplayPerformanceBody } from "@/clients/schemas";
import type { ScoreStats } from "@/official/types";
import type { UpstreamResult } from "@/types/upstream";

export interface StatsOptions {
    readonly strainChart?: boolean;
    /** Calculates on behalf of this person, so only the variants they may use are available. */
    readonly actingUid?: number;
}

export interface ReplayOptions {
    /** For replays that do not record mods (v1/v2): the score's mods and stats override the replay's. */
    readonly overrides?: ScoreStats;
    readonly strainChart?: boolean;
    /** Calculates on behalf of this person, so only the variants they may use are available. */
    readonly actingUid?: number;
}

export interface IScoreCalculator {
    /** Calculates a score from stored stats: hit counts, combo, `score` as total score, slider hit counts (when all four are recorded), and mods. */
    calculateStats(
        variant: string,
        stats: ScoreStats,
        options?: StatsOptions,
    ): Promise<UpstreamResult<PerformanceBody>>;

    calculateReplay(
        variant: string,
        replay: Buffer,
        options?: ReplayOptions,
    ): Promise<UpstreamResult<ReplayPerformanceBody>>;

    /** The total without tap and slider cheese penalties and without total score, for the resolved score of an earlier calculation. */
    noPenaltyTotal(
        variant: string,
        hash: string,
        calculation: PerformanceBody,
    ): Promise<UpstreamResult<number>>;
}
