import { Accuracy, Modes } from "@rian8337/osu-base";
import { IDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { IDifficultyAttributes as IRebalanceDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { ProcessorDatabaseBeatmap } from "../../database/processor/schema/ProcessorDatabaseBeatmap";
import { getBeatmapFile } from "../../services/beatmapService";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { CalculationWorkerData } from "../../structures/workers/CalculationWorkerData";
import { getBeatmap } from "../cache/beatmapStorage";
import { DifficultyAttributesCacheManager } from "../cache/difficultyattributes/DifficultyAttributesCacheManager";
import { CalculationWorkerPool } from "../workers/CalculationWorkerPool";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { PerformanceCalculationResult } from "./PerformanceCalculationResult";
import { RebalancePerformanceCalculationResult } from "./RebalancePerformanceCalculationResult";

/**
 * A helper class for calculating difficulty and performance of beatmaps or replays.
 */
export abstract class BeatmapDifficultyCalculator<
    DA extends IDifficultyAttributes,
    RDA extends IRebalanceDifficultyAttributes,
    PA extends PerformanceAttributes,
    RPA extends PerformanceAttributes = PA,
> {
    /**
     * The gamemode to calculate for.
     */
    protected abstract readonly mode: Modes;

    /**
     * The cache manager responsible for storing live calculation difficulty attributes.
     */
    protected abstract readonly liveDifficultyAttributesCache: DifficultyAttributesCacheManager<DA>;

    /**
     * The cache manager responsible for storing rebalance calculation difficulty attributes.
     */
    protected abstract readonly rebalanceDifficultyAttributesCache: DifficultyAttributesCacheManager<RDA>;

    /**
     * Calculator worker pool.
     */
    static readonly calculatorPool = new CalculationWorkerPool();

    /**
     * Gets the calculation parameters of a replay.
     *
     * @param replay The replay.
     */
    static getCalculationParameters(
        replay: ReplayAnalyzer,
    ): PerformanceCalculationParameters {
        const { data } = replay;

        if (!data) {
            throw new Error("Replay must be analyzed first");
        }

        const params = new PerformanceCalculationParameters({
            accuracy: new Accuracy(data.accuracy),
            combo: data.isReplayV3() ? data.maxCombo : undefined,
        });

        params.applyReplay(replay);

        return params;
    }

    /**
     * Calculates the difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        generateStrainChart: true,
        overrideParameters?: PerformanceCalculationParameters,
    ): Promise<PerformanceCalculationResult<DA, PA, true>>;

    /**
     * Calculates the difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        generateStrainChart: false,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<PerformanceCalculationResult<DA, PA, false>>;

    /**
     * Calculates the difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        generateStrainChart?: boolean,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        generateStrainChart?: boolean,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const calcParams =
            overrideParameters ??
            BeatmapDifficultyCalculator.getCalculationParameters(replay);

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.live,
            calcParams,
            replay,
            generateStrainChart,
        );
    }

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        generateStrainChart: true,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA, true>>;

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        generateStrainChart: false,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA, false>>;

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param generateStrainChart Whether to generate strain chart.
     * @param overrideParameters The parameters to override the replay with.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        generateStrainChart?: boolean,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        generateStrainChart?: boolean,
        overrideParameters?: PerformanceCalculationParameters | null,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const calcParams =
            overrideParameters ??
            BeatmapDifficultyCalculator.getCalculationParameters(replay);

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.rebalance,
            calcParams,
            replay,
            generateStrainChart,
        );
    }

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap, beatmap ID, or beatmap MD5 hash to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @param generateStrainChart Whether to generate strain chart.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams: PerformanceCalculationParameters,
        generateStrainChart: true,
    ): Promise<PerformanceCalculationResult<DA, PA, true>>;

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap, beatmap ID, or beatmap MD5 hash to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams: PerformanceCalculationParameters,
        generateStrainChart: false,
    ): Promise<PerformanceCalculationResult<DA, PA, false>>;

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap, beatmap ID, or beatmap MD5 hash to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @param generateStrainChart Whether to generate strain chart.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams?: PerformanceCalculationParameters,
        generateStrainChart?: boolean,
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    async calculateBeatmapPerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams?: PerformanceCalculationParameters,
        generateStrainChart?: boolean,
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        const apiBeatmap =
            typeof beatmap === "object" ? beatmap : await getBeatmap(beatmap);

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.live,
            calculationParams,
            undefined,
            generateStrainChart,
        );
    }

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @param generateStrainChart Whether to generate strain chart.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams: PerformanceCalculationParameters,
        generateStrainChart: true,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA, true>>;

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @param generateStrainChart Whether to generate strain chart.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams: PerformanceCalculationParameters,
        generateStrainChart: false,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA, false>>;

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @param generateStrainChart Whether to generate strain chart.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams?: PerformanceCalculationParameters,
        generateStrainChart?: boolean,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    async calculateBeatmapRebalancePerformance(
        beatmap: ProcessorDatabaseBeatmap | number | string,
        calculationParams?: PerformanceCalculationParameters,
        generateStrainChart?: boolean,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        const apiBeatmap =
            typeof beatmap === "object" ? beatmap : await getBeatmap(beatmap);

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.rebalance,
            calculationParams,
            undefined,
            generateStrainChart,
        );
    }

    private async calculatePerformance(
        beatmap: ProcessorDatabaseBeatmap,
        calculationMethod: PPCalculationMethod.live,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer,
        generateStrainChart?: boolean,
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    private async calculatePerformance(
        beatmap: ProcessorDatabaseBeatmap,
        calculationMethod: PPCalculationMethod.rebalance,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer,
        generateStrainChart?: boolean,
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    private async calculatePerformance(
        beatmap: ProcessorDatabaseBeatmap,
        calculationMethod: PPCalculationMethod,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer,
        generateStrainChart?: boolean,
    ): Promise<
        | PerformanceCalculationResult<DA, PA>
        | RebalancePerformanceCalculationResult<RDA, RPA>
    > {
        const cacheManager =
            calculationMethod === PPCalculationMethod.live
                ? this.liveDifficultyAttributesCache
                : this.rebalanceDifficultyAttributesCache;

        const beatmapFile = await getBeatmapFile(beatmap.id);

        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        const cachedAttributes = await cacheManager.getDifficultyAttributes(
            beatmap.id,
            calculationParams?.mods,
        );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: calculationMethod,
            difficultyAttributes: cachedAttributes,
            replayFile: replay?.originalODR
                ? new Blob([replay.originalODR])
                : undefined,
            parameters: calculationParams?.toCloneable(),
            generateStrainChart: generateStrainChart,
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: async (err, result) => {
                    if (err) {
                        reject(err);

                        return;
                    }

                    // Reconstruct the parameters in case some parameters were changed.
                    calculationParams = PerformanceCalculationParameters.from(
                        result.attributes.params,
                    );

                    const diffAttribs = {
                        ...result.attributes.difficulty,
                        mods: calculationParams.mods,
                    } as DA & RDA;

                    if (!cachedAttributes) {
                        await cacheManager.addAttribute(
                            beatmap.id,
                            diffAttribs,
                        );
                    }

                    if (calculationMethod === PPCalculationMethod.live) {
                        resolve(
                            new PerformanceCalculationResult(
                                calculationParams,
                                diffAttribs,
                                result.attributes.performance as PA,
                                result.attributes.replay,
                                result.strainChart
                                    ? Buffer.from(result.strainChart)
                                    : undefined,
                            ),
                        );
                    } else {
                        resolve(
                            new RebalancePerformanceCalculationResult(
                                calculationParams,
                                diffAttribs,
                                result.attributes.performance as RPA,
                                result.attributes.replay,
                                result.strainChart
                                    ? Buffer.from(result.strainChart)
                                    : undefined,
                            ),
                        );
                    }
                },
            });
        });
    }
}
