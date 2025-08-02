import { IBeatmapAPIProvider } from "@/api";
import { CalculationParameters, CalculationResult } from "@/calculations";
import { IScore } from "@/database/official/schema";
import { IDifficultyAttributesRepository } from "@/repositories/processor/IDifficultyAttributesRepository";
import {
    EitherOperationResult,
    PerformanceAttributes,
    RawDifficultyAttributes,
    ReplayAttributes,
} from "@/types";
import {
    Beatmap,
    BeatmapDecoder,
    Modes,
    ModMap,
    PlayableBeatmap,
} from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
    DifficultyCalculator,
    DifficultyHitObject,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import {
    DifficultyAttributes as RebalanceDifficultyAttributes,
    DifficultyCalculator as RebalanceDifficultyCalculator,
    DifficultyHitObject as RebalanceDifficultyHitObject,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import createStrainChart from "@rian8337/osu-strain-graph-generator";
import { BaseService } from "./BaseService";
import { IBeatmapService } from "./IBeatmapService";
import { ICalculationService } from "./ICalculationService";
import { IReplayService } from "./IReplayService";
import { createHash } from "crypto";

/**
 * Provides calculation-related operations.
 *
 * @template TDifficultyAttributes The type of difficulty attributes.
 * @template TPerformanceAttributes The type of performance attributes.
 */
export abstract class CalculationService<
        TDifficultyAttributes extends RawDifficultyAttributes,
        TPerformanceAttributes extends PerformanceAttributes,
    >
    extends BaseService
    implements
        ICalculationService<TDifficultyAttributes, TPerformanceAttributes>
{
    /**
     * The game mode for which this service provides calculations.
     */
    protected abstract readonly mode: Modes;

    /**
     * The difficulty calculator used for calculating difficulties.
     */
    protected abstract readonly difficultyCalculator:
        | DifficultyCalculator<
              PlayableBeatmap,
              DifficultyHitObject,
              DifficultyAttributes
          >
        | RebalanceDifficultyCalculator<
              PlayableBeatmap,
              RebalanceDifficultyHitObject,
              RebalanceDifficultyAttributes
          >;

    constructor(
        private readonly attributesRepository: IDifficultyAttributesRepository<TDifficultyAttributes>,
        private readonly beatmapService: IBeatmapService,
        private readonly replayService: IReplayService,
        private readonly beatmapApiProvider: IBeatmapAPIProvider,
    ) {
        super();
    }

    async calculateBeatmap<THasStrainChart extends boolean = false>(
        beatmapIdOrHash: number | string,
        parameters: CalculationParameters,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    > {
        const beatmapResult =
            await this.beatmapService.getBeatmap(beatmapIdOrHash);

        if (beatmapResult.failed()) {
            return beatmapResult;
        }

        const beatmapData = beatmapResult.data;
        const beatmapFile = await this.beatmapApiProvider.getBeatmapFile(
            beatmapData.id,
        );

        return this.calculate(
            this.decodeBeatmap(beatmapFile),
            parameters,
            beatmapData.id,
            generateStrainChart,
        );
    }

    async calculateBeatmapFile<THasStrainChart extends boolean = false>(
        beatmapFile: Buffer,
        parameters: CalculationParameters,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    > {
        // Attempt to retrieve beatmap information by MD5 hash.
        // We can reuse the difficulty attributes cache in that case.
        const beatmapHash = createHash("md5").update(beatmapFile).digest("hex");

        const beatmapId = await this.beatmapService
            .getBeatmap(beatmapHash)
            .then((result) =>
                result.isSuccessful() ? result.data.id : undefined,
            );

        return this.calculate(
            this.decodeBeatmap(beatmapFile),
            parameters,
            beatmapId,
            generateStrainChart,
        );
    }

    async calculateScore<THasStrainChart extends boolean = false>(
        score: Score | IScore,
        useBestPPReplay: boolean,
        generateStrainChart?: THasStrainChart,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    > {
        const beatmapResult = await this.beatmapService.getBeatmap(score.hash);

        if (beatmapResult.failed()) {
            return beatmapResult;
        }

        const beatmapData = beatmapResult.data;
        const beatmapFile = await this.beatmapApiProvider.getBeatmapFile(
            beatmapData.id,
        );

        const beatmap = this.decodeBeatmap(beatmapFile);

        // Use replay when available and valid.
        const replay = new ReplayAnalyzer({ scoreID: score.id });

        replay.originalODR = await (
            useBestPPReplay
                ? this.replayService.getBestReplay(score.id)
                : this.replayService.getReplay(score.id)
        ).catch(() => null);

        await replay.analyze().catch(() => null);

        const { data } = replay;

        const replayValid =
            data !== null
                ? this.replayService.isReplayValid(score, data)
                : false;

        const parameters = new CalculationParameters();

        if (replayValid) {
            parameters.applyReplay(replay);
        } else {
            parameters.applyScore(beatmap, score);
        }

        return this.calculate(
            beatmap,
            parameters,
            beatmapData.id,
            generateStrainChart,
            replayValid ? replay : undefined,
        );
    }

    private async calculate<THasStrainChart extends boolean>(
        beatmap: Beatmap,
        parameters: CalculationParameters,
        beatmapId?: number,
        generateStrainChart?: THasStrainChart,
        replay?: ReplayAnalyzer,
    ): Promise<
        EitherOperationResult<
            CalculationResult<
                TDifficultyAttributes,
                TPerformanceAttributes,
                THasStrainChart
            >
        >
    > {
        const difficultyAttributes = await this.obtainDifficultyAttributes(
            beatmap,
            parameters.mods,
            beatmapId,
        );

        parameters.applyFromAttributes(difficultyAttributes);

        const strainChart = generateStrainChart
            ? await this.obtainStrainChart(
                  beatmap,
                  parameters.mods,
                  difficultyAttributes,
              )
            : undefined;

        if (replay) {
            replay.beatmap = beatmap;

            this.processReplay(
                beatmap,
                replay,
                parameters,
                difficultyAttributes,
            );
        }

        const options: PerformanceCalculationOptions = {};

        parameters.applyToOptions(options);

        const performanceAttributes = this.calculatePerformance(
            difficultyAttributes,
            options,
        );

        const replayAttributes = replay
            ? (this.obtainReplayAttributes(replay) ?? undefined)
            : undefined;

        return this.createSuccessfulResponse(
            new CalculationResult(
                parameters,
                difficultyAttributes,
                performanceAttributes,
                replayAttributes,
                strainChart,
            ),
        );
    }

    private async obtainDifficultyAttributes(
        beatmap: Beatmap,
        mods: ModMap,
        beatmapId?: number,
    ): Promise<CacheableDifficultyAttributes<TDifficultyAttributes>> {
        let attributes =
            beatmapId !== undefined
                ? await this.attributesRepository.getAttributes(
                      beatmapId,
                      mods.values(),
                  )
                : null;

        if (!attributes) {
            attributes = this.difficultyCalculator
                .calculate(beatmap, mods)
                .toCacheableAttributes() as NonNullable<typeof attributes>;

            if (beatmapId !== undefined) {
                void this.attributesRepository.addAttributes(
                    beatmapId,
                    attributes,
                );
            }
        }

        return attributes;
    }

    private async obtainStrainChart(
        beatmap: Beatmap,
        mods: ModMap,
        attributes: CacheableDifficultyAttributes<TDifficultyAttributes>,
    ): Promise<Buffer> {
        const strainPeaks = this.difficultyCalculator.calculateStrainPeaks(
            beatmap,
            mods,
        );

        return createStrainChart(beatmap, strainPeaks, attributes.clockRate);
    }

    private obtainReplayAttributes(
        replay: ReplayAnalyzer,
    ): ReplayAttributes | null {
        if (!replay.beatmap || !replay.data) {
            return null;
        }

        const hitError = replay.calculateHitError()!;
        const { tick, end } = replay.obtainSliderHitInformation()!;

        return {
            hitError,
            sliderTickInformation: tick,
            sliderEndInformation: end,
        };
    }

    private decodeBeatmap(beatmapFile: Buffer): Beatmap {
        return new BeatmapDecoder().decode(
            beatmapFile.toString(),
            this.mode,
            false,
        ).result;
    }

    /**
     * Calculates the performance for the given difficulty attributes and options.
     *
     * @param attributes The difficulty attributes to calculate the performance for.
     * @param options The options to apply to the calculation.
     * @returns The calculated performance attributes.
     */
    protected abstract calculatePerformance(
        attributes: CacheableDifficultyAttributes<TDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): TPerformanceAttributes;

    /**
     * Processes a replay before calculating performance attributes.
     *
     * @param beatmap The beatmap being played.
     * @param replay The replay data.
     * @param parameters The calculation parameters.
     * @param attributes The difficulty attributes.
     */
    protected processReplay(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        beatmap: Beatmap,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        replay: ReplayAnalyzer,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        parameters: CalculationParameters,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        attributes: CacheableDifficultyAttributes<TDifficultyAttributes>,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
    ) {}
}
