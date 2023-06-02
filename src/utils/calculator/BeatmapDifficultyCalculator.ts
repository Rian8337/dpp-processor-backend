import { Accuracy, Beatmap, MapInfo, MapStats, Mod } from "@rian8337/osu-base";
import {
    DifficultyAttributes,
    DifficultyCalculator,
    PerformanceCalculator,
} from "@rian8337/osu-difficulty-calculator";
import {
    DifficultyAttributes as RebalanceDifficultyAttributes,
    DifficultyCalculator as RebalanceDifficultyCalculator,
    PerformanceCalculator as RebalancePerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "../cache/difficultyattributes/DifficultyAttributesCacheManager";
import { DifficultyCalculationParameters } from "./DifficultyCalculationParameters";
import { DifficultyCalculationResult } from "./DifficultyCalculationResult";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";
import { PerformanceCalculationResult } from "./PerformanceCalculationResult";
import { RebalanceDifficultyCalculationResult } from "./RebalanceDifficultyCalculationResult";
import { RebalancePerformanceCalculationResult } from "./RebalancePerformanceCalculationResult";
import { getBeatmap, getBeatmapFile } from "../cache/beatmapStorage";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BeatmapDecoder } from "@rian8337/osu-base";

/**
 * A helper class for calculating difficulty and performance of beatmaps or replays.
 */
export abstract class BeatmapDifficultyCalculator<
    DC extends DifficultyCalculator,
    PC extends PerformanceCalculator,
    RDC extends RebalanceDifficultyCalculator,
    RPC extends RebalancePerformanceCalculator,
    DA extends DifficultyAttributes,
    RDA extends RebalanceDifficultyAttributes
> {
    /**
     * The difficulty calculator to use.
     */
    protected abstract readonly difficultyCalculator: new (
        beatmap: Beatmap
    ) => DC;

    /**
     * The rebalance difficulty calculator to use.
     */
    protected abstract readonly rebalanceDifficultyCalculator: new (
        beatmap: Beatmap
    ) => RDC;

    /**
     * The performance calculator to use.
     */
    protected abstract readonly performanceCalculator: new (
        difficultyAttributes: DA
    ) => PC;

    /**
     * The rebalance performance calculator to use.
     */
    protected abstract readonly rebalancePerformanceCalculator: new (
        difficultyAttributes: RDA
    ) => RPC;

    /**
     * The cache manager responsible for storing live calculation difficulty attributes.
     */
    protected abstract readonly liveDifficultyAttributesCache: DifficultyAttributesCacheManager<DA>;

    /**
     * The cache manager responsible for storing rebalance calculation difficulty attributes.
     */
    protected abstract readonly rebalanceDifficultyAttributesCache: DifficultyAttributesCacheManager<RDA>;

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
     * @param calcParams Calculation parameters to override the replay's default calculation parameters.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateReplayPerformance(
        replay: ReplayAnalyzer,
        calcParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DC, PC> | null> {
        if (!replay.data) {
            return null;
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);

        if (!apiBeatmap) {
            return null;
        }

        calcParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);
        const { customStatistics } = calcParams;

        const attributeName =
            this.liveDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        let cachedAttributes =
            this.liveDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        let difficultyCalculator: DC | undefined;

        if (!cachedAttributes) {
            const result = await this.calculateDifficulty(
                apiBeatmap,
                calcParams
            );

            if (result) {
                difficultyCalculator = result.result;
                cachedAttributes = result.cachedAttributes;
            }
        }

        if (!cachedAttributes) {
            return null;
        }

        const difficultyAttributes: DA = <DA>{
            ...cachedAttributes,
            mods: <Mod[]>replay.data.convertedMods,
        };

        return this.calculatePerformance(
            difficultyAttributes,
            calcParams,
            difficultyCalculator
        );
    }

    /**
     * Calculates the rebalance difficulty and performance value of a replay.
     *
     * @param replay The replay.
     * @param calcParams Calculation parameters to override the replay's default calculation parameters.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateReplayRebalancePerformance(
        replay: ReplayAnalyzer,
        calcParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDC, RPC> | null> {
        if (!replay.data) {
            return null;
        }

        const apiBeatmap = await getBeatmap(replay.data.hash);

        if (!apiBeatmap) {
            return null;
        }

        calcParams ??=
            BeatmapDifficultyCalculator.getCalculationParameters(replay);
        const { customStatistics } = calcParams;

        const attributeName =
            this.liveDifficultyAttributesCache.getAttributeName(
                customStatistics?.mods,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            );

        let cachedAttributes =
            this.rebalanceDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        let difficultyCalculator: RDC | undefined;

        if (!cachedAttributes) {
            const result = await this.calculateRebalanceDifficulty(
                apiBeatmap,
                calcParams
            );

            if (result) {
                difficultyCalculator = result.result;
                cachedAttributes = result.cachedAttributes;
            }
        }

        if (!cachedAttributes) {
            return null;
        }

        const difficultyAttributes: RDA = <RDA>{
            ...cachedAttributes,
            mods: <Mod[]>replay.data.convertedMods,
        };

        return this.calculateRebalancePerformance(
            difficultyAttributes,
            calcParams,
            difficultyCalculator
        );
    }

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapPerformance(
        beatmap: MapInfo,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DC, PC> | null>;

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param attributes The difficulty attributes of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapPerformance(
        attributes: DA,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DC, PC>>;

    /**
     * Calculates the difficulty and/or performance value of a beatmap.
     *
     * @param beatmapIdOrHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapPerformance(
        beatmapIdOrHash: number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DC, PC> | null>;

    async calculateBeatmapPerformance(
        beatmapOrHashOrDA: MapInfo | number | string | DA,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<PerformanceCalculationResult<DC, PC> | null> {
        let apiBeatmap: MapInfo | null;

        if (beatmapOrHashOrDA instanceof MapInfo) {
            apiBeatmap = beatmapOrHashOrDA;
        } else if (
            typeof beatmapOrHashOrDA === "number" ||
            typeof beatmapOrHashOrDA === "string"
        ) {
            apiBeatmap = await getBeatmap(beatmapOrHashOrDA);
        } else {
            return this.calculatePerformance(
                beatmapOrHashOrDA,
                calculationParams ??
                    new PerformanceCalculationParameters(
                        new Accuracy({
                            n300:
                                beatmapOrHashOrDA.hitCircleCount +
                                beatmapOrHashOrDA.sliderCount +
                                beatmapOrHashOrDA.spinnerCount,
                        }),
                        100,
                        beatmapOrHashOrDA.maxCombo
                    )
            );
        }

        if (!apiBeatmap) {
            return null;
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

        let cachedAttributes =
            this.liveDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        let difficultyCalculator: DC | undefined;

        if (!cachedAttributes) {
            const star = await this.calculateDifficulty(
                apiBeatmap,
                calculationParams
            );

            if (star) {
                difficultyCalculator = star.result;
                cachedAttributes = star.cachedAttributes;
            }
        }

        if (!cachedAttributes) {
            return null;
        }

        const difficultyAttributes: DA = <DA>{
            ...cachedAttributes,
            mods: <Mod[]>customStatistics?.mods ?? [],
        };

        return this.calculatePerformance(
            difficultyAttributes,
            calculationParams,
            difficultyCalculator
        );
    }

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapRebalancePerformance(
        beatmap: MapInfo,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDC, RPC> | null>;

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param attributes The difficulty attributes of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapRebalancePerformance(
        attributes: RDA,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDC, RPC>>;

    /**
     * Calculates the rebalance difficulty and/or performance value of a beatmap.
     *
     * @param beatmapIDorHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters. If unspecified, will calculate for No Mod SS.
     * @returns The result of the calculation, `null` if the beatmap is not found.
     */
    async calculateBeatmapRebalancePerformance(
        beatmapIDorHash: number | string,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDC, RPC> | null>;

    async calculateBeatmapRebalancePerformance(
        beatmapOrHashOrDA: MapInfo | number | string | RDA,
        calculationParams?: PerformanceCalculationParameters
    ): Promise<RebalancePerformanceCalculationResult<RDC, RPC> | null> {
        let apiBeatmap: MapInfo | null;

        if (beatmapOrHashOrDA instanceof MapInfo) {
            apiBeatmap = beatmapOrHashOrDA;
        } else if (
            typeof beatmapOrHashOrDA === "number" ||
            typeof beatmapOrHashOrDA === "string"
        ) {
            apiBeatmap = await getBeatmap(beatmapOrHashOrDA);
        } else {
            return this.calculateRebalancePerformance(
                beatmapOrHashOrDA,
                calculationParams ??
                    new PerformanceCalculationParameters(
                        new Accuracy({
                            n300:
                                beatmapOrHashOrDA.hitCircleCount +
                                beatmapOrHashOrDA.sliderCount +
                                beatmapOrHashOrDA.spinnerCount,
                        }),
                        100,
                        beatmapOrHashOrDA.maxCombo
                    )
            );
        }

        if (!apiBeatmap) {
            return null;
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

        let cachedAttributes =
            this.rebalanceDifficultyAttributesCache.getDifficultyAttributes(
                apiBeatmap,
                attributeName
            );

        let difficultyCalculator: RDC | undefined;

        if (!cachedAttributes) {
            const star = await this.calculateRebalanceDifficulty(
                apiBeatmap,
                calculationParams
            );

            if (star) {
                difficultyCalculator = star.result;
                cachedAttributes = star.cachedAttributes;
            }
        }

        if (!cachedAttributes) {
            return null;
        }

        const difficultyAttributes: RDA = <RDA>{
            ...cachedAttributes,
            mods: <Mod[]>customStatistics?.mods ?? [],
        };

        return this.calculateRebalancePerformance(
            difficultyAttributes,
            calculationParams,
            difficultyCalculator
        );
    }

    /**
     * Calculates the difficulty of the beatmap being played in a replay.
     *
     * @param replay The replay to calculate.
     * @returns The calculation result.
     */
    async calculateReplayDifficulty(
        replay: ReplayAnalyzer
    ): Promise<DifficultyCalculationResult<DA, DC> | null> {
        if (!replay.data) {
            return null;
        }

        const beatmap = await getBeatmap(replay.data.hash);

        if (!beatmap) {
            return null;
        }

        return this.calculateDifficulty(
            beatmap,
            BeatmapDifficultyCalculator.getCalculationParameters(replay)
        );
    }

    /**
     * Calculates the rebalance difficulty of the beatmap being played in a replay.
     *
     * @param replay The replay to calculate.
     * @returns The calculation result.
     */
    async calculateReplayRebalanceDifficulty(
        replay: ReplayAnalyzer
    ): Promise<RebalanceDifficultyCalculationResult<RDA, RDC> | null> {
        if (!replay.data) {
            return null;
        }

        const beatmap = await getBeatmap(replay.data.hash);

        if (!beatmap) {
            return null;
        }

        return this.calculateRebalanceDifficulty(
            beatmap,
            BeatmapDifficultyCalculator.getCalculationParameters(replay)
        );
    }

    /**
     * Calculates the difficulty of a beatmap.
     *
     * @param beatmap The beatmap.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    async calculateBeatmapDifficulty(
        beatmap: MapInfo,
        calculationParams: DifficultyCalculationParameters
    ): Promise<DifficultyCalculationResult<DA, DC> | null>;

    /**
     * Calculates the difficulty of a beatmap.
     *
     * @param beatmapIdOrHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    async calculateBeatmapDifficulty(
        beatmapIdOrHash: number | string,
        calculationParams: DifficultyCalculationParameters
    ): Promise<DifficultyCalculationResult<DA, DC> | null>;

    async calculateBeatmapDifficulty(
        beatmapOrIdOrHash: MapInfo | number | string,
        calculationParams: DifficultyCalculationParameters
    ): Promise<DifficultyCalculationResult<DA, DC> | null> {
        const beatmap =
            beatmapOrIdOrHash instanceof MapInfo
                ? beatmapOrIdOrHash
                : await getBeatmap(beatmapOrIdOrHash);

        if (!beatmap) {
            return null;
        }

        return this.calculateDifficulty(beatmap, calculationParams);
    }

    /**
     * Calculates the rebalance difficulty of a beatmap.
     *
     * @param beatmap The beatmap.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    async calculateBeatmapRebalanceDifficulty(
        beatmap: MapInfo,
        calculationParams: DifficultyCalculationParameters
    ): Promise<RebalanceDifficultyCalculationResult<RDA, RDC> | null>;

    /**
     * Calculates the rebalance difficulty of a beatmap.
     *
     * @param beatmapIdorHash The ID or MD5 hash of the beatmap.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    async calculateBeatmapRebalanceDifficulty(
        beatmapIdorHash: number | string,
        calculationParams: DifficultyCalculationParameters
    ): Promise<RebalanceDifficultyCalculationResult<RDA, RDC> | null>;

    async calculateBeatmapRebalanceDifficulty(
        beatmapOrIdOrHash: MapInfo | number | string,
        calculationParams: DifficultyCalculationParameters
    ): Promise<RebalanceDifficultyCalculationResult<RDA, RDC> | null> {
        const beatmap =
            beatmapOrIdOrHash instanceof MapInfo
                ? beatmapOrIdOrHash
                : await getBeatmap(beatmapOrIdOrHash);

        if (!beatmap) {
            return null;
        }

        return this.calculateRebalanceDifficulty(beatmap, calculationParams);
    }

    /**
     * Calculates the difficulty of a beatmap.
     *
     * @param apiBeatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    private async calculateDifficulty(
        apiBeatmap: MapInfo,
        calculationParams: DifficultyCalculationParameters
    ): Promise<DifficultyCalculationResult<DA, DC> | null> {
        if (apiBeatmap.objects === 0) {
            return null;
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            return null;
        }

        const beatmap = new BeatmapDecoder().decode(
            beatmapFile,
            calculationParams.customStatistics?.mods
        ).result;

        const star: DC = new this.difficultyCalculator(beatmap).calculate({
            mods: calculationParams.customStatistics?.mods,
            stats: calculationParams.customStatistics,
        });

        const { customStatistics } = calculationParams;

        return new DifficultyCalculationResult(
            apiBeatmap,
            star,
            this.liveDifficultyAttributesCache.addAttribute(
                apiBeatmap,
                <DA>star.attributes,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            )
        );
    }

    /**
     * Calculates the rebalance difficulty of a beatmap.
     *
     * @param apiBeatmap The beatmap to calculate.
     * @param calculationParams Calculation parameters.
     * @returns The calculation result.
     */
    private async calculateRebalanceDifficulty(
        apiBeatmap: MapInfo,
        calculationParams: DifficultyCalculationParameters
    ): Promise<RebalanceDifficultyCalculationResult<RDA, RDC> | null> {
        if (apiBeatmap.objects === 0) {
            return null;
        }

        const beatmapFile = await getBeatmapFile(apiBeatmap);
        if (!beatmapFile) {
            return null;
        }

        const beatmap = new BeatmapDecoder().decode(
            beatmapFile,
            calculationParams.customStatistics?.mods
        ).result;

        const star: RDC = new this.rebalanceDifficultyCalculator(
            beatmap
        ).calculate({
            mods: calculationParams.customStatistics?.mods,
            stats: calculationParams.customStatistics,
        });

        const { customStatistics } = calculationParams;

        return new RebalanceDifficultyCalculationResult(
            apiBeatmap,
            star,
            this.rebalanceDifficultyAttributesCache.addAttribute(
                apiBeatmap,
                <RDA>star.attributes,
                customStatistics?.oldStatistics,
                customStatistics?.speedMultiplier,
                customStatistics?.isForceAR ? customStatistics.ar : undefined
            )
        );
    }

    /**
     * Calculates the performance value of a beatmap.
     *
     * @param difficultyAttributes The difficulty attributes to calculate the performance value for.
     * @param calculationParams Calculation parameters.
     * @param difficultyCalculator The difficulty calculator that was used to calculate the beatmap.
     * @returns The result of the calculation.
     */
    private calculatePerformance(
        difficultyAttributes: DA,
        calculationParams: PerformanceCalculationParameters,
        difficultyCalculator?: DC
    ): PerformanceCalculationResult<DC, PC> | null {
        calculationParams.applyFromAttributes(difficultyAttributes);

        const pp: PC = new this.performanceCalculator(
            difficultyAttributes
        ).calculate({
            combo: calculationParams.combo,
            accPercent: calculationParams.accuracy,
            tapPenalty: calculationParams.tapPenalty,
            aimSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.aimPenalty,
            flashlightSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.flashlightPenalty,
            visualSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.visualPenalty,
        });

        return new PerformanceCalculationResult(
            calculationParams,
            pp,
            difficultyCalculator
        );
    }

    /**
     * Calculates the performance value of a beatmap.
     *
     * @param difficultyAttributes The difficulty attributes to calculate the performance value for.
     * @param calculationParams Calculation parameters.
     * @param difficultyCalculator The difficulty calculator that was used to calculate the beatmap.
     * @returns The result of the calculation.
     */
    private calculateRebalancePerformance(
        difficultyAttributes: RDA,
        calculationParams: PerformanceCalculationParameters,
        difficultyCalculator?: RDC
    ): RebalancePerformanceCalculationResult<RDC, RPC> | null {
        calculationParams.applyFromAttributes(difficultyAttributes);

        const pp: RPC = new this.rebalancePerformanceCalculator(
            difficultyAttributes
        ).calculate({
            combo: calculationParams.combo,
            accPercent: calculationParams.accuracy,
            tapPenalty: calculationParams.tapPenalty,
            aimSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.aimPenalty,
            flashlightSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.flashlightPenalty,
            visualSliderCheesePenalty:
                calculationParams.sliderCheesePenalty?.visualPenalty,
        });

        return new RebalancePerformanceCalculationResult(
            calculationParams,
            pp,
            difficultyCalculator
        );
    }
}
