import type { IBrokerClient } from "@/clients/IBrokerClient";
import type { PerformanceBody, ReplayPerformanceBody } from "@/clients/schemas";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ScoreStats } from "@/official/types";
import { parseModsColumn } from "@/replays/replayValidity";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { ScoreParameters } from "@dpp/shared";
import { inject } from "tsyringe";
import type {
    IScoreCalculator,
    ReplayOptions,
    StatsOptions,
} from "./IScoreCalculator";

@Injectable(dependencyTokens.scoreCalculator)
export class ScoreCalculator implements IScoreCalculator {
    constructor(
        @inject(dependencyTokens.brokerClient)
        private readonly broker: IBrokerClient,
    ) {}

    calculateStats(
        variant: string,
        stats: ScoreStats,
        options: StatsOptions = {},
    ): Promise<UpstreamResult<PerformanceBody>> {
        const mods = parseModsColumn(stats.mods);

        if (!mods) {
            return Promise.resolve(unreadableMods());
        }

        return this.broker.performance(
            variant,
            {
                beatmap: { hash: stats.hash },
                mods,
                score: {
                    ...statsParameters(stats),
                    ...(stats.totalScore !== null && {
                        totalScore: stats.totalScore,
                    }),
                },
                strainChart: options.strainChart ?? false,
            },
            options.actingUid,
        );
    }

    calculateReplay(
        variant: string,
        replay: Buffer,
        options: ReplayOptions = {},
    ): Promise<UpstreamResult<ReplayPerformanceBody>> {
        const { overrides } = options;
        const mods = overrides ? parseModsColumn(overrides.mods) : undefined;

        if (mods === null) {
            return Promise.resolve(unreadableMods());
        }

        return this.broker.replayPerformance(
            variant,
            {
                replay: replay.toString("base64"),
                ...(overrides && { mods, score: statsParameters(overrides) }),
                strainChart: options.strainChart ?? false,
            },
            options.actingUid,
        );
    }

    async noPenaltyTotal(
        variant: string,
        hash: string,
        calculation: PerformanceBody,
    ): Promise<UpstreamResult<number>> {
        const { score } = calculation;
        const result = await this.broker.performance(variant, {
            beatmap: { hash },
            mods: calculation.difficulty.mods,
            score: {
                n300: score.n300,
                n100: score.n100,
                n50: score.n50,
                nmiss: score.nmiss,
                combo: score.combo,
                ...(score.sliderTicksMissed !== undefined && {
                    sliderTicksMissed: score.sliderTicksMissed,
                }),
                ...(score.sliderEndsDropped !== undefined && {
                    sliderEndsDropped: score.sliderEndsDropped,
                }),
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            },
        });

        return result.ok
            ? { ok: true, value: result.value.performance.total }
            : result;
    }
}

/**
 * Hit counts, combo, and (when all four are recorded) slider hit counts from a stored score.
 */
function statsParameters(stats: ScoreStats): ScoreParameters {
    const { sliderHeadHit, sliderTickHit, sliderRepeatHit, sliderEndHit } =
        stats;

    return {
        n300: stats.perfect ?? 0,
        n100: stats.good ?? 0,
        n50: stats.bad ?? 0,
        nmiss: stats.miss ?? 0,
        combo: stats.combo ?? 0,
        ...(sliderHeadHit !== null &&
            sliderTickHit !== null &&
            sliderRepeatHit !== null &&
            sliderEndHit !== null && {
                sliderHeadHits: sliderHeadHit,
                sliderTickHits: sliderTickHit,
                sliderRepeatHits: sliderRepeatHit,
                sliderEndHits: sliderEndHit,
            }),
    };
}

function unreadableMods() {
    return {
        ok: false,
        kind: "rejected",
        status: 422,
        code: "INVALID_REQUEST",
        message: "The score's mods are unreadable",
    } as const;
}
