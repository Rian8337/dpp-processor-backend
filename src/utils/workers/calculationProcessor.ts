import { parentPort } from "worker_threads";
import { CalculationWorkerData } from "../../structures/workers/CalculationWorkerData";
import {
    Accuracy,
    Beatmap,
    BeatmapDecoder,
    MathUtils,
    Modes,
    Slider,
    SliderTail,
    SliderTick,
} from "@rian8337/osu-base";
import { PerformanceCalculationParameters } from "../calculator/PerformanceCalculationParameters";
import {
    HitResult,
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import {
    CacheableDifficultyAttributes,
    DroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import generateChart from "@rian8337/osu-strain-graph-generator";
import { BeatmapDroidDifficultyCalculator } from "../calculator/BeatmapDroidDifficultyCalculator";
import { CompleteCalculationAttributes } from "../../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../../structures/attributes/DroidPerformanceAttributes";
import { RebalanceDroidPerformanceAttributes } from "../../structures/attributes/RebalanceDroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import { SliderTickInformation } from "../../structures/SliderTickInformation";
import { createHash } from "crypto";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";
import { calculateLocalBeatmapDifficulty } from "../calculator/LocalBeatmapDifficultyCalculator";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../../structures/attributes/PerformanceAttributes";
import { StrainGraphColor } from "../../enums/StrainGraphColor";

const beatmapCache = new LimitedCapacityCollection<string, Beatmap>(
    250,
    180000,
);

function processTickInformation(
    beatmap: Beatmap,
    data: ReplayData,
    sliderTickInformation: SliderTickInformation,
    sliderEndInformation: SliderTickInformation,
): void {
    for (let i = 0; i < data.hitObjectData.length; ++i) {
        const object = beatmap.hitObjects.objects[i];
        const objectData = data.hitObjectData[i];

        if (
            objectData.result === HitResult.miss ||
            !(object instanceof Slider)
        ) {
            continue;
        }

        // Exclude the head circle.
        for (let j = 1; j < object.nestedHitObjects.length; ++j) {
            const nested = object.nestedHitObjects[j];

            if (!objectData.tickset[j - 1]) {
                continue;
            }

            if (nested instanceof SliderTick) {
                ++sliderTickInformation.obtained;
            } else if (nested instanceof SliderTail) {
                ++sliderEndInformation.obtained;
            }
        }
    }
}

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

    const analyzer = new ReplayAnalyzer({ scoreID: 0, map: beatmap });

    if (data.replayFile) {
        analyzer.originalODR = Buffer.from(await data.replayFile.arrayBuffer());
        await analyzer.analyze().catch(() => null);

        if (!analyzer.data) {
            return parentPort?.postMessage(
                new Error("Unable to obtain replay data"),
            );
        }

        if (!parameters) {
            calculationParams.applyReplay(analyzer);
        }
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
    calculationParams.applyToOptions(calculationOptions);

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
                    let difficultyAttributes: CacheableDifficultyAttributes<ExtendedDroidDifficultyAttributes>;

                    if (generateStrainChart) {
                        const difficultyCalculator =
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            );

                        difficultyAttributes = {
                            ...difficultyCalculator.attributes,
                            mods: parameters?.mods ?? "",
                        };

                        strainChart = await generateChart(
                            beatmap,
                            difficultyCalculator.strainPeaks,
                            difficultyCalculator.attributes.clockRate,
                            undefined,
                            StrainGraphColor.droidLive,
                        );
                    } else {
                        difficultyAttributes =
                            (data.difficultyAttributes as CacheableDifficultyAttributes<ExtendedDroidDifficultyAttributes> | null) ?? {
                                ...calculateLocalBeatmapDifficulty(
                                    beatmap,
                                    calculationParams,
                                    gamemode,
                                    calculationMethod,
                                ).attributes,
                                mods: parameters?.mods ?? "",
                            };
                    }

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: ExtendedDroidDifficultyAttributes =
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

                        calculationParams.applyToOptions(calculationOptions);
                    }

                    const perfCalc = new DroidPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate(calculationOptions);

                    const sliderTickInformation: SliderTickInformation = {
                        obtained: 0,
                        total: beatmap.hitObjects.sliderTicks,
                    };
                    const sliderEndInformation: SliderTickInformation = {
                        obtained: 0,
                        total: beatmap.hitObjects.sliderEnds,
                    };

                    if (analyzer.data) {
                        processTickInformation(
                            beatmap,
                            analyzer.data,
                            sliderTickInformation,
                            sliderEndInformation,
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            tap: perfCalc.tap,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                            visual: perfCalc.visual,
                            deviation: perfCalc.deviation,
                            tapDeviation: perfCalc.tapDeviation,
                            tapPenalty: perfCalc.tapPenalty,
                            aimSliderCheesePenalty:
                                perfCalc.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                perfCalc.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                perfCalc.visualSliderCheesePenalty,
                        },
                        replay: analyzer.data
                            ? {
                                  hitError:
                                      analyzer.calculateHitError() ?? undefined,
                                  sliderTickInformation: sliderTickInformation,
                                  sliderEndInformation: sliderEndInformation,
                              }
                            : undefined,
                    } as CompleteCalculationAttributes<
                        ExtendedDroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    let difficultyAttributes: CacheableDifficultyAttributes<RebalanceExtendedDroidDifficultyAttributes>;

                    if (generateStrainChart) {
                        const difficultyCalculator =
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            );

                        difficultyAttributes = {
                            ...difficultyCalculator.attributes,
                            mods: parameters?.mods ?? "",
                        };

                        strainChart = await generateChart(
                            beatmap,
                            difficultyCalculator.strainPeaks,
                            difficultyCalculator.attributes.clockRate,
                            undefined,
                            StrainGraphColor.droidRebalance,
                        );
                    } else {
                        difficultyAttributes =
                            (data.difficultyAttributes as CacheableDifficultyAttributes<RebalanceExtendedDroidDifficultyAttributes> | null) ?? {
                                ...calculateLocalBeatmapDifficulty(
                                    beatmap,
                                    calculationParams,
                                    gamemode,
                                    calculationMethod,
                                ).attributes,
                                mods: parameters?.mods ?? "",
                            };
                    }

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: RebalanceExtendedDroidDifficultyAttributes =
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

                        calculationParams.applyToOptions(calculationOptions);
                    }

                    const perfCalc = new RebalanceDroidPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate(calculationOptions);
                    const hitError = analyzer.calculateHitError();

                    const sliderTickInformation: SliderTickInformation = {
                        obtained: 0,
                        total: beatmap.hitObjects.sliderTicks,
                    };
                    const sliderEndInformation: SliderTickInformation = {
                        obtained: 0,
                        total: beatmap.hitObjects.sliderEnds,
                    };

                    if (analyzer.data) {
                        processTickInformation(
                            beatmap,
                            analyzer.data,
                            sliderTickInformation,
                            sliderEndInformation,
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            tap: perfCalc.tap,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                            visual: perfCalc.visual,
                            deviation: perfCalc.deviation,
                            tapDeviation: perfCalc.tapDeviation,
                            tapPenalty: perfCalc.tapPenalty,
                            aimSliderCheesePenalty:
                                perfCalc.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                perfCalc.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                perfCalc.visualSliderCheesePenalty,
                            calculatedUnstableRate: analyzer.data
                                ? (hitError?.unstableRate ?? 0) /
                                  difficultyAttributes.clockRate
                                : 0,
                            estimatedUnstableRate: MathUtils.round(
                                perfCalc.deviation * 10,
                                2,
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                perfCalc.tapDeviation * 10,
                                2,
                            ),
                        },
                        replay: analyzer.data
                            ? {
                                  hitError: hitError ?? undefined,
                                  sliderTickInformation: sliderTickInformation,
                                  sliderEndInformation: sliderEndInformation,
                              }
                            : undefined,
                    } as CompleteCalculationAttributes<
                        RebalanceExtendedDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    >;

                    break;
                }
            }

            break;
        }
        case Modes.osu: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    let difficultyAttributes: CacheableDifficultyAttributes<OsuDifficultyAttributes>;

                    if (generateStrainChart) {
                        const difficultyCalculator =
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            );

                        difficultyAttributes = {
                            ...difficultyCalculator.attributes,
                            mods: parameters?.mods ?? "",
                        };

                        strainChart = await generateChart(
                            beatmap,
                            difficultyCalculator.strainPeaks,
                            difficultyCalculator.attributes.clockRate,
                            undefined,
                            StrainGraphColor.osuLive,
                        );
                    } else {
                        difficultyAttributes =
                            (data.difficultyAttributes as CacheableDifficultyAttributes<OsuDifficultyAttributes> | null) ??
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            ).cacheableAttributes;
                    }

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
                        },
                    } as CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    let difficultyAttributes: CacheableDifficultyAttributes<RebalanceOsuDifficultyAttributes>;

                    if (generateStrainChart) {
                        const difficultyCalculator =
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            );

                        difficultyAttributes = {
                            ...difficultyCalculator.attributes,
                            mods: parameters?.mods ?? "",
                        };

                        strainChart = await generateChart(
                            beatmap,
                            difficultyCalculator.strainPeaks,
                            difficultyCalculator.attributes.clockRate,
                            undefined,
                            StrainGraphColor.osuRebalance,
                        );
                    } else {
                        difficultyAttributes =
                            (data.difficultyAttributes as CacheableDifficultyAttributes<RebalanceOsuDifficultyAttributes> | null) ??
                            calculateLocalBeatmapDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod,
                            ).cacheableAttributes;
                    }

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
                        },
                    } as CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

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
