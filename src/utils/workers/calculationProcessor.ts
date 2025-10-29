import { Accuracy, Beatmap, BeatmapDecoder, Modes } from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    DroidPerformanceCalculator,
    IExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import {
    IExtendedDroidDifficultyAttributes as IRebalanceExtendedDroidDifficultyAttributes,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import generateChart from "@rian8337/osu-strain-graph-generator";
import { createHash } from "crypto";
import { parentPort } from "worker_threads";
import { StrainGraphColor } from "../../enums/StrainGraphColor";
import { CompleteCalculationAttributes } from "../../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";
import { RebalanceDroidPerformanceAttributes } from "../../structures/attributes/RebalanceDroidPerformanceAttributes";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import { CalculationWorkerData } from "../../structures/workers/CalculationWorkerData";
import { BeatmapDroidDifficultyCalculator } from "../calculator/BeatmapDroidDifficultyCalculator";
import {
    calculateLocalBeatmapDifficulty,
    getStrainPeaks,
} from "../calculator/LocalBeatmapDifficultyCalculator";
import { PerformanceCalculationParameters } from "../calculator/PerformanceCalculationParameters";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";
import { obtainTickInformation } from "../replayManager";

const beatmapCache = new LimitedCapacityCollection<string, Beatmap>(
    250,
    180000,
);

parentPort?.on("message", async (data: CalculationWorkerData) => {
    const { gamemode, calculationMethod, parameters, generateStrainChart } =
        data;

    const beatmapMD5 = createHash("md5").update(data.beatmapFile).digest("hex");
    const beatmap =
        beatmapCache.get(beatmapMD5) ??
        new BeatmapDecoder().decode(data.beatmapFile, gamemode).result;

    if (!beatmapCache.has(beatmapMD5)) {
        beatmapCache.set(beatmapMD5, beatmap);
    }

    const calculationParams = parameters
        ? PerformanceCalculationParameters.from(parameters)
        : new PerformanceCalculationParameters({
              combo: beatmap.maxCombo,
              accuracy: new Accuracy({
                  nobjects: beatmap.hitObjects.objects.length,
              }),
          });

    const analyzer = new ReplayAnalyzer({ map: beatmap });

    if (data.replayFile) {
        analyzer.originalODR = Buffer.from(await data.replayFile.arrayBuffer());
        await analyzer.analyze().catch(() => null);

        if (!analyzer.data) {
            return parentPort?.postMessage(
                new Error("Unable to obtain replay data"),
            );
        }

        calculationParams.applyReplay(analyzer);
    }

    // Check for potentially invalid properties.
    // Graveyarded beatmaps will return a `null` max combo from osu! API.
    calculationParams.combo ??= beatmap.maxCombo;

    // Ensure that the combo is within the maximum combo.
    calculationParams.combo = Math.min(
        calculationParams.combo,
        beatmap.maxCombo,
    );

    const calculationOptions: PerformanceCalculationOptions = {};
    calculationParams.applyToOptions(beatmap, calculationOptions);

    let attributes:
        | CompleteCalculationAttributes<
              RawDifficultyAttributes,
              PerformanceAttributes
          >
        | undefined;
    let strainChart: Buffer | undefined;

    switch (gamemode) {
        case Modes.droid: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const difficultyAttributes =
                        (data.difficultyAttributes as CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes> | null) ??
                        calculateLocalBeatmapDifficulty(
                            beatmap,
                            calculationParams.mods,
                            gamemode,
                            calculationMethod,
                        ).toCacheableAttributes();

                    if (generateStrainChart) {
                        strainChart = await generateChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                calculationParams.mods,
                                gamemode,
                                calculationMethod,
                            ),
                            difficultyAttributes.clockRate,
                            { color: StrainGraphColor.droidLive },
                        );
                    }

                    // Overwrite mods here with the ones that are requested.
                    difficultyAttributes.mods =
                        parameters?.mods ?? difficultyAttributes.mods;

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: IExtendedDroidDifficultyAttributes =
                            {
                                ...difficultyAttributes,
                                mods: calculationParams.mods,
                            };

                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes,
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error("Unable to analyze for three-finger"),
                            );
                        }

                        if (
                            !BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes,
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error(
                                    "Unable to analyze for slider cheesing",
                                ),
                            );
                        }

                        calculationParams.applyToOptions(
                            beatmap,
                            calculationOptions,
                        );
                    }

                    const perfCalc = new DroidPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate(calculationOptions);

                    const sliderInformation = analyzer.data
                        ? obtainTickInformation(beatmap, analyzer.data)
                        : null;

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            tap: perfCalc.tap,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                            reading: perfCalc.reading,
                            deviation: perfCalc.deviation,
                            tapDeviation: perfCalc.tapDeviation,
                            tapPenalty: perfCalc.tapPenalty,
                            aimSliderCheesePenalty:
                                perfCalc.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                perfCalc.flashlightSliderCheesePenalty,
                        } as DroidPerformanceAttributes,
                        replay:
                            analyzer.data && sliderInformation
                                ? {
                                      hitError:
                                          analyzer.calculateHitError() ??
                                          undefined,
                                      sliderTickInformation:
                                          sliderInformation.tick,
                                      sliderEndInformation:
                                          sliderInformation.end,
                                  }
                                : undefined,
                    };

                    break;
                }

                case PPCalculationMethod.rebalance: {
                    const difficultyAttributes: CacheableDifficultyAttributes<IRebalanceExtendedDroidDifficultyAttributes> =
                        (data.difficultyAttributes as CacheableDifficultyAttributes<IRebalanceExtendedDroidDifficultyAttributes> | null) ??
                        calculateLocalBeatmapDifficulty(
                            beatmap,
                            calculationParams.mods,
                            gamemode,
                            calculationMethod,
                        ).toCacheableAttributes();

                    if (generateStrainChart) {
                        strainChart = await generateChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                calculationParams.mods,
                                gamemode,
                                calculationMethod,
                            ),
                            difficultyAttributes.clockRate,
                            { color: StrainGraphColor.droidRebalance },
                        );
                    }

                    // Also overwrite mods here in case it was not overridden above (due to cache).
                    difficultyAttributes.mods =
                        parameters?.mods ?? difficultyAttributes.mods;

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: IRebalanceExtendedDroidDifficultyAttributes =
                            {
                                ...difficultyAttributes,
                                mods: calculationParams.mods,
                            };

                        if (
                            !BeatmapDroidDifficultyCalculator.applyTwoHandPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes,
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error("Unable to analyze for two-hand"),
                            );
                        }

                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes,
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error("Unable to analyze for three-finger"),
                            );
                        }

                        if (
                            !BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes,
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error(
                                    "Unable to analyze for slider cheesing",
                                ),
                            );
                        }

                        calculationParams.applyToOptions(
                            beatmap,
                            calculationOptions,
                        );
                    }

                    const sliderInformation = analyzer.data
                        ? obtainTickInformation(beatmap, analyzer.data)
                        : null;

                    const perfCalc = new RebalanceDroidPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate({
                        ...calculationOptions,
                        sliderTicksMissed: sliderInformation
                            ? sliderInformation.tick.total -
                              sliderInformation.tick.obtained
                            : undefined,
                        sliderEndsDropped: sliderInformation
                            ? sliderInformation.end.total -
                              sliderInformation.end.obtained
                            : undefined,
                    });

                    const hitError = analyzer.calculateHitError();

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            tap: perfCalc.tap,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                            reading: perfCalc.reading,
                            deviation: perfCalc.deviation,
                            tapDeviation: perfCalc.tapDeviation,
                            tapPenalty: perfCalc.tapPenalty,
                            aimSliderCheesePenalty:
                                perfCalc.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                perfCalc.flashlightSliderCheesePenalty,
                            calculatedUnstableRate: analyzer.data
                                ? (hitError?.unstableRate ?? 0) /
                                  difficultyAttributes.clockRate
                                : 0,
                            estimatedUnstableRate: perfCalc.deviation * 10,
                            estimatedSpeedUnstableRate:
                                perfCalc.tapDeviation * 10,
                        } as RebalanceDroidPerformanceAttributes,
                        replay:
                            analyzer.data && sliderInformation
                                ? {
                                      hitError:
                                          analyzer.calculateHitError() ??
                                          undefined,
                                      sliderTickInformation:
                                          sliderInformation.tick,
                                      sliderEndInformation:
                                          sliderInformation.end,
                                  }
                                : undefined,
                    };

                    break;
                }
            }

            break;
        }

        case Modes.osu: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const difficultyAttributes: CacheableDifficultyAttributes<OsuDifficultyAttributes> =
                        (data.difficultyAttributes as CacheableDifficultyAttributes<OsuDifficultyAttributes> | null) ??
                        calculateLocalBeatmapDifficulty(
                            beatmap,
                            calculationParams.mods,
                            gamemode,
                            calculationMethod,
                        ).toCacheableAttributes();

                    if (generateStrainChart) {
                        strainChart = await generateChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                calculationParams.mods,
                                gamemode,
                                calculationMethod,
                            ),
                            difficultyAttributes.clockRate,
                            { color: StrainGraphColor.osuLive },
                        );
                    }

                    // Overwrite mods here with the ones that are requested.
                    difficultyAttributes.mods =
                        parameters?.mods ?? difficultyAttributes.mods;

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    const perfCalc = new OsuPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate(calculationOptions);

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            speed: perfCalc.speed,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                        } as OsuPerformanceAttributes,
                    };

                    break;
                }

                case PPCalculationMethod.rebalance: {
                    const difficultyAttributes: CacheableDifficultyAttributes<RebalanceOsuDifficultyAttributes> =
                        (data.difficultyAttributes as CacheableDifficultyAttributes<RebalanceOsuDifficultyAttributes> | null) ??
                        calculateLocalBeatmapDifficulty(
                            beatmap,
                            calculationParams.mods,
                            gamemode,
                            calculationMethod,
                        ).toCacheableAttributes();

                    if (generateStrainChart) {
                        strainChart = await generateChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                calculationParams.mods,
                                gamemode,
                                calculationMethod,
                            ),
                            difficultyAttributes.clockRate,
                            { color: StrainGraphColor.osuLive },
                        );
                    }

                    // Overwrite mods here with the ones that are requested.
                    difficultyAttributes.mods =
                        parameters?.mods ?? difficultyAttributes.mods;

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    const perfCalc = new RebalanceOsuPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate(calculationOptions);

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            speed: perfCalc.speed,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                        } as OsuPerformanceAttributes,
                    };

                    break;
                }
            }

            break;
        }
    }

    parentPort?.postMessage({
        attributes: attributes,
        strainChart: strainChart,
    });
});
