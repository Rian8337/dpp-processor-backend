import { Accuracy, MapInfo, MapStats, Modes } from "@rian8337/osu-base";
import { DifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DifficultyAttributes as RebalanceDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "../cache/difficultyattributes/DifficultyAttributesCacheManager";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { PerformanceCalculationResult } from "./PerformanceCalculationResult";
import { RebalancePerformanceCalculationResult } from "./RebalancePerformanceCalculationResult";
import { getBeatmap, getBeatmapFile } from "../cache/beatmapStorage";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { CalculationWorkerPool } from "../workers/CalculationWorkerPool";
import { CalculationWorkerData } from "../../structures/workers/CalculationWorkerData";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import { CompleteCalculationAttributes } from "../../structures/attributes/CompleteCalculationAttributes";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";

/**
 * A helper class for calculating difficulty and performance of beatmaps or replays.
 */
export abstract class BeatmapDifficultyCalculator<
    DA extends DifficultyAttributes,
    RDA extends RebalanceDifficultyAttributes,
    PA extends PerformanceAttributes,
    RPA extends PerformanceAttributes = PA
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
     * @param replayAnalyzer The replay.
     */
    static getCalculationParameters(
        replayAnalyzer: ReplayAnalyzer
    ): PerformanceCalculationParameters {
        const { data } = replayAnalyzer;
        if (!data) {
            throw new Error("Replay must be analyzed first");
        }

        return new PerformanceCalculationParameters(
            data.accuracy,
            data.maxCombo,
            replayAnalyzer.tapPenalty,
            new MapStats({
                mods: data.convertedMods,
                ar: data.forcedAR,
                speedMultiplier: data.speedModification,
                isForceAR: data.forcedAR !== undefined,
                oldStatistics: data.replayVersion <= 3,
            }),
            replayAnalyzer.sliderCheesePenalty
        );
    }

    /**
     * Calculates the difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param calculationParams Calculation parameters to override the replay's default calculation parameters.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);

        return this.calculatePerformance(
            apiBeatmap,
            calculationParams,
            PPCalculationMethod.live,
            replay
        );
    }

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param calculationParams Calculation parameters to override the replay's default calculation parameters.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);

        return this.calculatePerformance(
            apiBeatmap,
            calculationParams,
            PPCalculationMethod.rebalance,
            replay
        );
    }

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmap: MapInfo | number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        const apiBeatmap: MapInfo | null =
            beatmap instanceof MapInfo ? beatmap : await getBeatmap(beatmap);

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??= new PerformanceCalculationParameters(
            new Accuracy({
                n300: apiBeatmap.objects,
            }),
            100,
            apiBeatmap.maxCombo
        );

        return this.calculatePerformance(
            apiBeatmap,
            calculationParams,
            PPCalculationMethod.live
        );
    }

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: MapInfo | number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        const apiBeatmap: MapInfo | null =
            beatmap instanceof MapInfo ? beatmap : await getBeatmap(beatmap);

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??= new PerformanceCalculationParameters(
            new Accuracy({
                n300: apiBeatmap.objects,
            }),
            100,
            apiBeatmap.maxCombo
        );

        return this.calculatePerformance(
            apiBeatmap,
            calculationParams,
            PPCalculationMethod.rebalance
        );
    }

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationParams: PerformanceCalculationParameters,
        calculationMethod: PPCalculationMethod.live,
        replay?: ReplayAnalyzer
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationParams: PerformanceCalculationParameters,
        calculationMethod: PPCalculationMethod.rebalance,
        replay?: ReplayAnalyzer
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationParams: PerformanceCalculationParameters,
        calculationMethod: PPCalculationMethod,
        replay?: ReplayAnalyzer
    ): Promise<
        | PerformanceCalculationResult<DA, PA>
        | RebalancePerformanceCalculationResult<RDA, RPA>
    > {
        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        const { customStatistics } = calculationParams;

        const cacheManager =
            calculationMethod === PPCalculationMethod.live
                ? this.liveDifficultyAttributesCache
                : this.rebalanceDifficultyAttributesCache;

        const attributeName = cacheManager.getAttributeName(
            customStatistics?.mods,
            customStatistics?.oldStatistics,
            customStatistics?.speedMultiplier,
            customStatistics?.isForceAR ? customStatistics.ar : undefined
        );
        const cachedAttributes = cacheManager.getDifficultyAttributes(
            apiBeatmap,
            attributeName
        );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: calculationMethod,
            difficultyAttributes: cachedAttributes,
            replayFile: replay?.originalODR
                ? new Blob([replay.originalODR])
                : undefined,
            parameters: calculationParams.toCloneable(),
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: (
                    err,
                    result: CompleteCalculationAttributes<
                        DifficultyAttributes | RebalanceDifficultyAttributes,
                        PerformanceAttributes
                    >
                ) => {
                    if (err) {
                        return reject(err);
                    }

                    const diffAttribs = <DA & RDA>{
                        ...result.difficulty,
                        mods: calculationParams.customStatistics?.mods ?? [],
                    };

                    const { customStatistics } = calculationParams;

                    if (!cachedAttributes) {
                        cacheManager.addAttribute(
                            apiBeatmap,
                            diffAttribs,
                            customStatistics?.oldStatistics,
                            customStatistics?.speedMultiplier,
                            customStatistics?.isForceAR
                                ? customStatistics.ar
                                : undefined
                        );
                    }

                    resolve(
                        new RebalancePerformanceCalculationResult(
                            calculationParams,
                            diffAttribs,
                            <RPA>result.performance
                        )
                    );
                },
            });
        });
    }
}
