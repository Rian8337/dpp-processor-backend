import { Accuracy, MapInfo, Modes } from "@rian8337/osu-base";
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
     * @param replay The replay.
     */
    static getCalculationParameters(
        replay: ReplayAnalyzer
    ): PerformanceCalculationParameters {
        const { data } = replay;

        if (!data) {
            throw new Error("Replay must be analyzed first");
        }

        const params = new PerformanceCalculationParameters({
            accuracy: new Accuracy(data.accuracy),
            combo: data.maxCombo,
        });

        params.applyReplay(replay);

        return params;
    }

    /**
     * Calculates the difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.live,
            BeatmapDifficultyCalculator.getCalculationParameters(replay),
            replay
        );
    }

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        if (!replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.rebalance,
            BeatmapDifficultyCalculator.getCalculationParameters(replay),
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

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.live,
            calculationParams
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

        return this.calculatePerformance(
            apiBeatmap,
            PPCalculationMethod.rebalance,
            calculationParams
        );
    }

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationMethod: PPCalculationMethod.live,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationMethod: PPCalculationMethod.rebalance,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    private async calculatePerformance(
        apiBeatmap: MapInfo,
        calculationMethod: PPCalculationMethod,
        calculationParams?: PerformanceCalculationParameters,
        replay?: ReplayAnalyzer
    ): Promise<
        | PerformanceCalculationResult<DA, PA>
        | RebalancePerformanceCalculationResult<RDA, RPA>
    > {
        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        const cacheManager =
            calculationMethod === PPCalculationMethod.live
                ? this.liveDifficultyAttributesCache
                : this.rebalanceDifficultyAttributesCache;

        const forceCS = calculationParams?.forceCS;
        const forceAR = calculationParams?.forceAR;
        const forceOD = calculationParams?.forceOD;

        const attributeName = cacheManager.getAttributeName(
            calculationParams?.mods,
            calculationParams?.oldStatistics,
            calculationParams?.customSpeedMultiplier,
            forceCS,
            forceAR,
            forceOD
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
            parameters: calculationParams?.toCloneable(),
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

                    // Reconstruct the parameters in case some parameters were changed.
                    calculationParams = PerformanceCalculationParameters.from(
                        result.params
                    );

                    const diffAttribs = <DA & RDA>{
                        ...result.difficulty,
                        mods: calculationParams?.mods ?? [],
                    };

                    if (!cachedAttributes) {
                        cacheManager.addAttribute(
                            apiBeatmap,
                            diffAttribs,
                            calculationParams?.oldStatistics,
                            calculationParams?.customSpeedMultiplier,
                            forceCS,
                            forceAR,
                            forceOD
                        );
                    }

                    if (calculationMethod === PPCalculationMethod.live) {
                        resolve(
                            new PerformanceCalculationResult(
                                calculationParams,
                                diffAttribs,
                                <PA>result.performance,
                                result.replay
                            )
                        );
                    } else {
                        resolve(
                            new RebalancePerformanceCalculationResult(
                                calculationParams,
                                diffAttribs,
                                <RPA>result.performance,
                                result.replay
                            )
                        );
                    }
                },
            });
        });
    }
}
