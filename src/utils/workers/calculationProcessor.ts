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
    DroidDifficultyAttributes,
    DroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PerformanceCalculationResult } from "../calculator/PerformanceCalculationResult";
import { BeatmapDroidDifficultyCalculator } from "../calculator/BeatmapDroidDifficultyCalculator";
import { CompleteCalculationAttributes } from "../../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../../structures/attributes/DroidPerformanceAttributes";
import { RebalancePerformanceCalculationResult } from "../calculator/RebalancePerformanceCalculationResult";
import { RebalanceDroidPerformanceAttributes } from "../../structures/attributes/RebalanceDroidPerformanceAttributes";
import { BeatmapDifficultyCalculator } from "../calculator/BeatmapDifficultyCalculator";
import { OsuPerformanceAttributes } from "../../structures/attributes/OsuPerformanceAttributes";
import { SliderTickInformation } from "../../structures/SliderTickInformation";

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

    const calculationParams = parameters
        ? PerformanceCalculationParameters.from(parameters)
        : new PerformanceCalculationParameters(new Accuracy({ n300: 0 }));

    const beatmap = new BeatmapDecoder().decode(
        data.beatmapFile,
        calculationParams.customStatistics?.mods
    ).result;

    const analyzer = new ReplayAnalyzer({ scoreID: 0, map: beatmap });
    if (data.replayFile) {
        analyzer.originalODR = Buffer.from(await data.replayFile.arrayBuffer());
        await analyzer.analyze().catch(() => {});

        if (!analyzer.data) {
            return parentPort?.postMessage(
                new Error("Unable to obtain replay data")
            );
        }
    }

    const calculationOptions: PerformanceCalculationOptions = {};
    calculationParams.applyToOptions(calculationOptions);

    switch (gamemode) {
        case Modes.droid: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    data.difficultyAttributes ??=
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes;
                    data.difficultyAttributes.mods ??=
                        calculationParams.customStatistics?.mods;

                    calculationParams.applyFromAttributes(
                        data.difficultyAttributes
                    );

                    if (analyzer.data) {
                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                <ExtendedDroidDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
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
                                <ExtendedDroidDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
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

                    const calcResult = new PerformanceCalculationResult(
                        calculationParams,
                        <DroidDifficultyAttributes>data.difficultyAttributes,
                        new DroidPerformanceCalculator(
                            <DroidDifficultyAttributes>data.difficultyAttributes
                        ).calculate(calculationOptions)
                    );

                    const { result } = calcResult;

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
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: result.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                ""
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            tap: result.tap,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                            visual: result.visual,
                            deviation: result.deviation,
                            tapDeviation: result.tapDeviation,
                            tapPenalty: result.tapPenalty,
                            aimSliderCheesePenalty:
                                result.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                result.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                result.visualSliderCheesePenalty,
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
                    data.difficultyAttributes ??=
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes;
                    data.difficultyAttributes.mods ??=
                        calculationParams.customStatistics?.mods;

                    if (analyzer.data) {
                        if (
                            !BeatmapDroidDifficultyCalculator.applyTapPenalty(
                                calculationParams,
                                beatmap,
                                analyzer,
                                <ExtendedDroidDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
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
                                <RebalanceExtendedDroidDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
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

                    const calcResult =
                        new RebalancePerformanceCalculationResult(
                            calculationParams,
                            <RebalanceExtendedDroidDifficultyAttributes>(
                                data.difficultyAttributes
                            ),
                            new RebalanceDroidPerformanceCalculator(
                                <RebalanceDroidDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
                            ).calculate(calculationOptions)
                        );

                    const { result } = calcResult;
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
                        RebalanceDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: result.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                ""
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            tap: result.tap,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                            visual: result.visual,
                            deviation: result.deviation,
                            tapDeviation: result.tapDeviation,
                            tapPenalty: result.tapPenalty,
                            aimSliderCheesePenalty:
                                result.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                result.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                result.visualSliderCheesePenalty,
                            calculatedUnstableRate: analyzer.data
                                ? (hitError?.unstableRate ?? 0) /
                                  (BeatmapDifficultyCalculator.getCalculationParameters(
                                      analyzer
                                  ).customStatistics?.calculate()
                                      .speedMultiplier ?? 1)
                                : 0,
                            estimatedUnstableRate: MathUtils.round(
                                result.deviation * 10,
                                2
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                result.tapDeviation * 10,
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
                    data.difficultyAttributes ??=
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes;
                    data.difficultyAttributes.mods ??=
                        calculationParams.customStatistics?.mods;

                    const calcResult = new PerformanceCalculationResult(
                        calculationParams,
                        <OsuDifficultyAttributes>data.difficultyAttributes,
                        new OsuPerformanceCalculator(
                            <OsuDifficultyAttributes>data.difficultyAttributes
                        ).calculate(calculationOptions)
                    );

                    const { result } = calcResult;

                    const attributes: CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: result.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                ""
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    };

                    parentPort?.postMessage(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    data.difficultyAttributes ??=
                        LocalBeatmapDifficultyCalculator.calculateDifficulty(
                            beatmap,
                            calculationParams,
                            gamemode,
                            calculationMethod
                        ).attributes;
                    data.difficultyAttributes.mods ??=
                        calculationParams.customStatistics?.mods;

                    const calcResult =
                        new RebalancePerformanceCalculationResult(
                            calculationParams,
                            <RebalanceOsuDifficultyAttributes>(
                                data.difficultyAttributes
                            ),
                            new RebalanceOsuPerformanceCalculator(
                                <RebalanceOsuDifficultyAttributes>(
                                    data.difficultyAttributes
                                )
                            ).calculate(calculationOptions)
                        );

                    const { result } = calcResult;

                    const attributes: CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: result.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                ""
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
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
