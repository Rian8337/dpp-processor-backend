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
        if (!replay.originalODR || !replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);
        const { customStatistics } = calculationParams;

        const attributeName =
            this.liveDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        const cachedAttributes =
            this.liveDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: PPCalculationMethod.live,
            difficultyAttributes: cachedAttributes,
            replayFile: new Blob([replay.originalODR]),
            parameters: calculationParams.toCloneable(),
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: (
                    err,
                    result: CompleteCalculationAttributes<
                        DifficultyAttributes,
                        PerformanceAttributes
                    >
                ) => {
                    if (err) {
                        return reject(err);
                    }

                    const diffAttribs = <DA>{
                        ...result.difficulty,
                        mods: calculationParams?.customStatistics?.mods ?? [],
                    };

                    if (!cachedAttributes) {
                        this.liveDifficultyAttributesCache.addAttribute(
                            apiBeatmap,
                            diffAttribs,
                            calculationParams?.customStatistics?.oldStatistics,
                            calculationParams?.customStatistics
                                ?.speedMultiplier,
                            calculationParams?.customStatistics?.isForceAR
                                ? calculationParams.customStatistics.ar
                                : undefined
                        );
                    }

                    resolve(
                        new PerformanceCalculationResult(
                            calculationParams!,
                            diffAttribs,
                            <PA>result.performance
                        )
                    );
                },
            });
        });
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
        if (!replay.originalODR || !replay.data) {
            throw new Error("No replay data found");
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);
        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);
        const { customStatistics } = calculationParams;

        const attributeName =
            this.rebalanceDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        const cachedAttributes =
            this.rebalanceDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: PPCalculationMethod.live,
            difficultyAttributes: cachedAttributes,
            replayFile: new Blob([replay.originalODR]),
            parameters: calculationParams.toCloneable(),
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: (
                    err,
                    result: CompleteCalculationAttributes<
                        RebalanceDifficultyAttributes,
                        PerformanceAttributes
                    >
                ) => {
                    if (err) {
                        return reject(err);
                    }

                    const diffAttribs = <RDA>{
                        ...result.difficulty,
                        mods: calculationParams?.customStatistics?.mods ?? [],
                    };

                    if (!cachedAttributes) {
                        this.rebalanceDifficultyAttributesCache.addAttribute(
                            apiBeatmap,
                            diffAttribs,
                            calculationParams?.customStatistics?.oldStatistics,
                            calculationParams?.customStatistics
                                ?.speedMultiplier,
                            calculationParams?.customStatistics?.isForceAR
                                ? calculationParams.customStatistics.ar
                                : undefined
                        );
                    }

                    resolve(
                        new RebalancePerformanceCalculationResult(
                            calculationParams!,
                            diffAttribs,
                            <RPA>result.performance
                        )
                    );
                },
            });
        });
    }

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmap: MapInfo,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmapIdOrHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapPerformance(
        beatmapIdOrHash: number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DA, PA>>;

    async calculateBeatmapPerformance(
        beatmapOrHashOrDA: MapInfo | number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DA, PA>> {
        let apiBeatmap: MapInfo | null;

        if (beatmapOrHashOrDA instanceof MapInfo) {
            apiBeatmap = beatmapOrHashOrDA;
        } else {
            apiBeatmap = await getBeatmap(beatmapOrHashOrDA);
        }

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??= new PerformanceCalculationParameters(
            new Accuracy({
                n300: apiBeatmap.objects,
            }),
            100,
            apiBeatmap.maxCombo
        );

        const { customStatistics } = calculationParams;

        const attributeName =
            this.liveDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        const cachedAttributes =
            this.liveDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: PPCalculationMethod.live,
            difficultyAttributes: cachedAttributes,
            parameters: calculationParams.toCloneable(),
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: (
                    err,
                    result: CompleteCalculationAttributes<
                        RebalanceDifficultyAttributes,
                        PerformanceAttributes
                    >
                ) => {
                    if (err) {
                        return reject(err);
                    }

                    const diffAttribs = <DA>{
                        ...result.difficulty,
                        mods: calculationParams?.customStatistics?.mods ?? [],
                    };

                    if (!cachedAttributes) {
                        this.liveDifficultyAttributesCache.addAttribute(
                            apiBeatmap!,
                            diffAttribs,
                            calculationParams?.customStatistics?.oldStatistics,
                            calculationParams?.customStatistics
                                ?.speedMultiplier,
                            calculationParams?.customStatistics?.isForceAR
                                ? calculationParams.customStatistics.ar
                                : undefined
                        );
                    }

                    resolve(
                        new PerformanceCalculationResult(
                            calculationParams!,
                            diffAttribs,
                            <PA>result.performance
                        )
                    );
                },
            });
        });
    }

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: MapInfo,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmapIDorHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation. Errors will be thrown whenever necessary.
     */
    async calculateBeatmapRebalancePerformance(
        beatmapIDorHash: number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>>;

    async calculateBeatmapRebalancePerformance(
        beatmapOrHashOrDA: MapInfo | number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDA, RPA>> {
        let apiBeatmap: MapInfo | null;

        if (beatmapOrHashOrDA instanceof MapInfo) {
            apiBeatmap = beatmapOrHashOrDA;
        } else {
            apiBeatmap = await getBeatmap(beatmapOrHashOrDA);
        }

        if (!apiBeatmap) {
            throw new Error("Beatmap not found");
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            throw new Error("Beatmap not found");
        }

        calculationParams ??= new PerformanceCalculationParameters(
            new Accuracy({
                n300: apiBeatmap.objects,
            }),
            100,
            apiBeatmap.maxCombo
        );

        const { customStatistics } = calculationParams;

        const attributeName =
            this.rebalanceDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        const cachedAttributes =
            this.rebalanceDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        const data: CalculationWorkerData = {
            beatmapFile: beatmapFile,
            gamemode: this.mode,
            calculationMethod: PPCalculationMethod.rebalance,
            difficultyAttributes: cachedAttributes,
            parameters: calculationParams.toCloneable(),
        };

        return new Promise((resolve, reject) => {
            BeatmapDifficultyCalculator.calculatorPool.runTask({
                data,
                callback: (
                    err,
                    result: CompleteCalculationAttributes<
                        RebalanceDifficultyAttributes,
                        PerformanceAttributes
                    >
                ) => {
                    if (err) {
                        return reject(err);
                    }

                    const diffAttribs = <RDA>{
                        ...result.difficulty,
                        mods: calculationParams?.customStatistics?.mods ?? [],
                    };

                    if (!cachedAttributes) {
                        this.rebalanceDifficultyAttributesCache.addAttribute(
                            apiBeatmap!,
                            diffAttribs,
                            calculationParams?.customStatistics?.oldStatistics,
                            calculationParams?.customStatistics
                                ?.speedMultiplier,
                            calculationParams?.customStatistics?.isForceAR
                                ? calculationParams.customStatistics.ar
                                : undefined
                        );
                    }

                    resolve(
                        new RebalancePerformanceCalculationResult(
                            calculationParams!,
                            diffAttribs,
                            <RPA>result.performance
                        )
                    );
                },
            });
        });
    }
}
