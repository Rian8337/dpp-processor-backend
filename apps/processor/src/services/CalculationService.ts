import { AlgorithmInputError } from "@/algorithms/errors";
import type { Algorithm, PerformanceResult } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { strainChartColor } from "@/calculation/strainChartColor";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import {
    BadRequestError,
    CalculationFailedError,
    UnprocessableEntityError,
} from "@/types/errors";
import type {
    DifficultyRequest,
    DifficultyResponse,
    PerformanceRequest,
    PerformanceResponse,
    ReplayPerformanceRequest,
    ReplayPerformanceResponse,
    ScoreParameters,
} from "@dpp/shared";
import { ModUtil, type ModMap, type SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import type { IBeatmapService, ResolvedBeatmap } from "./IBeatmapService";
import type { ICalculationService } from "./ICalculationService";
import type { IDifficultyCacheService } from "./IDifficultyCacheService";

type Attributes = CacheableDifficultyAttributes<IDifficultyAttributes>;

@Injectable(dependencyTokens.calculationService)
export class CalculationService implements ICalculationService {
    constructor(
        @inject(dependencyTokens.algorithm)
        private readonly algorithm: Algorithm,
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
        @inject(dependencyTokens.beatmapService)
        private readonly beatmaps: IBeatmapService,
        @inject(dependencyTokens.difficultyCacheService)
        private readonly difficultyCache: IDifficultyCacheService,
        @inject(dependencyTokens.calculationRunner)
        private readonly runner: ICalculationRunner,
    ) {}

    async calculateDifficulty(
        request: DifficultyRequest,
    ): Promise<DifficultyResponse> {
        const beatmap = await this.beatmaps.resolve(request.beatmap);
        const difficulty = await this.getDifficulty(beatmap, request.mods);

        return {
            difficulty,
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    async calculatePerformance(
        request: PerformanceRequest,
    ): Promise<PerformanceResponse> {
        const beatmap = await this.beatmaps.resolve(request.beatmap);
        const difficulty = await this.getDifficulty(beatmap, request.mods);

        return {
            difficulty,
            ...this.calculatePerformanceAttributes(difficulty, request.score),
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    async calculateReplayPerformance(
        request: ReplayPerformanceRequest,
    ): Promise<ReplayPerformanceResponse> {
        const replay = Buffer.from(request.replay, "base64");
        const header = await this.runner.readReplay(replay);
        const mods = request.mods ?? header.mods;

        if (!mods) {
            throw new UnprocessableEntityError(
                "INVALID_REPLAY",
                "This replay does not record its mods; pass them in `mods`",
            );
        }

        const beatmap = await this.beatmaps.resolve({
            hash: header.beatmapHash,
        });
        const difficulty = await this.getDifficulty(beatmap, mods);

        const analysis = await this.runner.analyzeReplay({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            replay,
            difficulty,
        });

        return {
            difficulty,
            ...this.calculatePerformanceAttributes(difficulty, {
                ...analysis.score,
                ...request.score,
            }),
            replay: analysis.replay,
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    /**
     * Gets difficulty attributes with the requested mods put back, since mods such as NoFail change performance
     * without changing difficulty.
     */
    private async getDifficulty(
        beatmap: ResolvedBeatmap,
        mods: SerializedMod[],
    ): Promise<Attributes> {
        const attributes = await this.difficultyCache.get(
            beatmap,
            this.parseMods(mods),
        );

        return { ...attributes, mods };
    }

    private parseMods(mods: SerializedMod[]): ModMap {
        const parsed = ModUtil.deserializeMods(mods);

        if (parsed.size !== mods.length) {
            throw new BadRequestError(
                "mods contains unknown or duplicate mods",
            );
        }

        return parsed;
    }

    private calculatePerformanceAttributes(
        difficulty: Attributes,
        score: ScoreParameters,
    ): PerformanceResult {
        try {
            return this.algorithm.calculatePerformance(difficulty, score);
        } catch (e) {
            if (e instanceof AlgorithmInputError) {
                throw e.toApiError();
            }

            console.error("Performance calculation failed:", e);

            throw new CalculationFailedError(
                e instanceof Error
                    ? e.message
                    : "Performance calculation failed",
            );
        }
    }

    private async renderStrainChart(
        requested: boolean,
        beatmap: ResolvedBeatmap,
        difficulty: Attributes,
    ): Promise<{ strainChart?: string }> {
        if (!requested) {
            return {};
        }

        const chart = await this.runner.renderStrainChart({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            mods: difficulty.mods,
            clockRate: difficulty.clockRate,
            color: strainChartColor(
                this.manifest.mode,
                this.manifest.algorithm,
            ),
        });

        return { strainChart: chart.toString("base64") };
    }
}
