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
import { LocalBeatmapDifficultyCalculator } from "../calculator/LocalBeatmapDifficultyCalculator";
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
import { BeatmapDroidDifficultyCalculator } from "../calculator/BeatmapDroidDifficultyCalculator";
import { CompleteCalculationAttributes } from "../../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../../structures/attributes/DroidPerformanceAttributes";
import { RebalanceDroidPerformanceAttributes } from "../../structures/attributes/RebalanceDroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import { SliderTickInformation } from "../../structures/SliderTickInformation";
import { createHash } from "crypto";
import { LimitedCapacityCollection } from "../LimitedCapacityCollection";

const beatmapCache = new LimitedCapacityCollection<string, Beatmap>(
    250,
    180000
);

function processTickInformation(
    beatmap: Beatmap,
    data: ReplayData,
    sliderTickInformation: SliderTickInformation,
    sliderEndInformation: SliderTickInformation
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
    const { gamemode, calculationMethod, parameters } = data;

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
        await analyzer.analyze().catch(() => {});

        if (!analyzer.data) {
            return parentPort?.postMessage(
                new Error("Unable to obtain replay data")
            );
        }

        calculationParams.applyReplay(analyzer);
    }

    // Check for potentially invalid properties.
    // Some beatmaps return `null` max combo from osu! API, i.e. /b/1462961.
    if (Number.isNaN(calculationParams.combo)) {
        calculationParams.combo = beatmap.maxCombo;
    }

    const calculationOptions: PerformanceCalculationOptions = {};
    calculationParams.applyToOptions(calculationOptions);

    switch (gamemode) {
        case Modes.droid: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const difficultyAttributes = <
                        CacheableDifficultyAttributes<ExtendedDroidDifficultyAttributes> | null
                    >data.difficultyAttributes ?? {
                        ...LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes,
                        mods: parameters?.mods ?? "",
                    };

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: ExtendedDroidDifficultyAttributes =
                            {
                                ...difficultyAttributes,
                                mods: calculationParams?.mods ?? [],
                            };

                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error("Unable to analyze for three-finger")
                            );
                        }

                        if (
                            !BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error(
                                    "Unable to analyze for slider cheesing"
                                )
                            );
                        }

                        calculationParams.applyToOptions(calculationOptions);
                    }

                    const perfCalc = new DroidPerformanceCalculator(
                        difficultyAttributes
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
                            sliderEndInformation
                        );
                    }

                    const attributes: CompleteCalculationAttributes<
                        ExtendedDroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    > = {
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
                    };

                    parentPort?.postMessage(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const difficultyAttributes = <
                        CacheableDifficultyAttributes<RebalanceExtendedDroidDifficultyAttributes> | null
                    >data.difficultyAttributes ?? {
                        ...LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes,
                        mods: parameters?.mods ?? "",
                    };

                    calculationParams.applyFromAttributes(difficultyAttributes);

                    if (analyzer.data) {
                        const extendedDifficultyAttributes: RebalanceExtendedDroidDifficultyAttributes =
                            {
                                ...difficultyAttributes,
                                mods: calculationParams?.mods ?? [],
                            };

                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error("Unable to analyze for three-finger")
                            );
                        }

                        if (
                            !BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                extendedDifficultyAttributes
                            )
                        ) {
                            return parentPort?.postMessage(
                                new Error(
                                    "Unable to analyze for slider cheesing"
                                )
                            );
                        }

                        calculationParams.applyToOptions(calculationOptions);
                    }

                    const perfCalc = new RebalanceDroidPerformanceCalculator(
                        difficultyAttributes
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
                            sliderEndInformation
                        );
                    }

                    const attributes: CompleteCalculationAttributes<
                        RebalanceExtendedDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    > = {
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
                                2
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                perfCalc.tapDeviation * 10,
                                2
                            ),
                        },
                        replay: analyzer.data
                            ? {
                                  hitError: hitError ?? undefined,
                                  sliderTickInformation: sliderTickInformation,
                                  sliderEndInformation: sliderEndInformation,
                              }
                            : undefined,
                    };

                    parentPort?.postMessage(attributes);

                    break;
                }
            }
            break;
        }
        case Modes.osu: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const difficultyAttributes =
                        <
                            CacheableDifficultyAttributes<OsuDifficultyAttributes> | null
                        >data.difficultyAttributes ??
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).cacheableAttributes;

                    const perfCalc = new OsuPerformanceCalculator(
                        difficultyAttributes
                    ).calculate(calculationOptions);

                    const attributes: CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            speed: perfCalc.speed,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                        },
                    };

                    parentPort?.postMessage(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const difficultyAttributes =
                        <
                            CacheableDifficultyAttributes<RebalanceOsuDifficultyAttributes> | null
                        >data.difficultyAttributes ??
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).cacheableAttributes;

                    const perfCalc = new RebalanceOsuPerformanceCalculator(
                        difficultyAttributes
                    ).calculate(calculationOptions);

                    const attributes: CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: difficultyAttributes,
                        performance: {
                            total: perfCalc.total,
                            aim: perfCalc.aim,
                            speed: perfCalc.speed,
                            accuracy: perfCalc.accuracy,
                            flashlight: perfCalc.flashlight,
                        },
                    };

                    parentPort?.postMessage(attributes);

                    break;
                }
            }
            break;
        }
    }
});
