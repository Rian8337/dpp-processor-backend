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
import {
    CacheableDifficultyAttributes,
    DroidPerformanceCalculator,
    IExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    HitResult,
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
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
import { SliderTickInformation } from "../../structures/SliderTickInformation";
import { CalculationWorkerData } from "../../structures/workers/CalculationWorkerData";
import { BeatmapDroidDifficultyCalculator } from "../calculator/BeatmapDroidDifficultyCalculator";
import {
    calculateLocalBeatmapDifficulty,
    getStrainPeaks,
} from "../calculator/LocalBeatmapDifficultyCalculator";
import { PerformanceCalculationParameters } from "../calculator/PerformanceCalculationParameters";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";

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

    let beatmap = beatmapCache.get(beatmapMD5);

    if (!beatmap) {
        beatmap = new BeatmapDecoder().decode(
            data.beatmapFile,
            gamemode,
        ).result;

        // Temporary because this is bugged - remove after updating module.
        beatmap.mode = gamemode;

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
                    const difficultyAttributes: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes> =
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
                        } as DroidPerformanceAttributes,
                        replay: analyzer.data
                            ? {
                                  hitError:
                                      analyzer.calculateHitError() ?? undefined,
                                  sliderTickInformation: sliderTickInformation,
                                  sliderEndInformation: sliderEndInformation,
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

                    const perfCalc = new RebalanceDroidPerformanceCalculator(
                        difficultyAttributes,
                    ).calculate({
                        ...calculationOptions,
                        sliderTicksMissed: analyzer.data
                            ? sliderTickInformation.total -
                              sliderTickInformation.obtained
                            : undefined,
                        sliderEndsDropped: analyzer.data
                            ? sliderEndInformation.total -
                              sliderEndInformation.obtained
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
                        } as RebalanceDroidPerformanceAttributes,
                        replay: analyzer.data
                            ? {
                                  hitError: hitError ?? undefined,
                                  sliderTickInformation: sliderTickInformation,
                                  sliderEndInformation: sliderEndInformation,
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
