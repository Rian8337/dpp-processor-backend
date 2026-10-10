import type { PerformanceBody } from "@/clients/schemas";
import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ReplayParser } from "@/replays/parseReplay";
import type { UpstreamFailure } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { CalculateScoreFields, GamePPResponse } from "@dpp/shared";
import { inject } from "tsyringe";
import type { IGamePPService } from "./IGamePPService";
import type { IScoreCalculator } from "./IScoreCalculator";
import { ppMultiplierFrom } from "./ppMultiplier";

const nothing: GamePPResponse = { pp: null, pp_multiplier: null };

@Injectable(dependencyTokens.gamePPService)
export class GamePPService implements IGamePPService {
    constructor(
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async calculateScore(
        fields: CalculateScoreFields,
    ): Promise<GamePPResponse> {
        const variant = fields.variant ?? this.config.variants.liveDroid;
        const result = await this.calculator.calculateStats(variant, {
            hash: fields.hash,
            mods: JSON.stringify(fields.mods),
            totalScore: fields.totalScore,
            combo: fields.combo,
            perfect: fields.perfect,
            good: fields.good,
            bad: fields.bad,
            miss: fields.miss,
            sliderHeadHit: fields.sliderHits?.head ?? null,
            sliderTickHit: fields.sliderHits?.tick ?? null,
            sliderRepeatHit: fields.sliderHits?.repeat ?? null,
            sliderEndHit: fields.sliderHits?.end ?? null,
        });

        if (!result.ok) {
            return failed("calculate-score", variant, result);
        }

        return this.withMultiplier(
            "calculate-score",
            variant,
            fields.hash,
            result.value,
            result.value.performance.total * fields.ppMultiplier,
        );
    }

    async calculateReplay(
        replay: Buffer,
        requestedVariant?: string,
    ): Promise<GamePPResponse> {
        const variant = requestedVariant ?? this.config.variants.liveDroid;
        const parsed = await this.parse(replay);

        // As pp-processor-node: only replays of v3 and later, with replayVersion above 6.
        if (!parsed?.v3 || parsed.version <= 6) {
            console.log(
                `calculate-replay failed (variant ${variant}): unsupported or unreadable replay`,
            );
            return nothing;
        }

        const result = await this.calculator.calculateReplay(variant, replay);

        if (!result.ok) {
            return failed("calculate-replay", variant, result);
        }

        return this.withMultiplier(
            "calculate-replay",
            variant,
            parsed.hash,
            result.value,
            result.value.performance.total,
        );
    }

    private async withMultiplier(
        route: string,
        variant: string,
        hash: string,
        body: PerformanceBody,
        pp: number,
    ): Promise<GamePPResponse> {
        const noPenalty = await this.calculator.noPenaltyTotal(
            variant,
            hash,
            body,
        );

        if (!noPenalty.ok) {
            return failed(route, variant, noPenalty);
        }

        return { pp, pp_multiplier: ppMultiplierFrom(pp, noPenalty.value) };
    }
}

function failed(
    route: string,
    variant: string,
    failure: UpstreamFailure,
): GamePPResponse {
    console.log(
        `${route} failed (variant ${variant}): ${failure.code} ${failure.message}`,
    );
    return nothing;
}
