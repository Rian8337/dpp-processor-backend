import {
    ModUtil,
    MathUtils,
    Modes,
    Accuracy,
    BeatmapDecoder,
    SerializedMod,
} from "@rian8337/osu-base";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import generateStrainChart from "@rian8337/osu-strain-graph-generator";
import { Router } from "express";
import { ReadStream } from "fs";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { validatePOSTInternalKey } from "../utils/util";
import {
    calculateLocalBeatmapDifficulty,
    calculateLocalBeatmapPerformance,
    getStrainPeaks,
} from "../utils/calculator/LocalBeatmapDifficultyCalculator";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";
import { StrainGraphColor } from "../enums/StrainGraphColor";
import { buffer } from "stream/consumers";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    Partial<{
        key: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        n300?: string;
        n100?: string;
        n50?: string;
        nmiss?: string;
        sliderticksmissed?: string;
        sliderendsdropped?: string;
        maxcombo?: string;
        aimslidercheesepenalty?: string;
        tappenalty?: string;
        flashlightslidercheesepenalty?: string;
        generatestrainchart?: string;
    }>
>("/", validatePOSTInternalKey, async (req, res) => {
    if (!req.body.calculationmethod) {
        return res
            .status(400)
            .json({ error: "Calculation method is required" });
    }

    // @ts-expect-error: Bad typings
    const fileStream = (req.files as Record<string, ReadStream | undefined>)
        .file;

    if (!fileStream) {
        return res.status(400).json({ error: "Beatmap not found" });
    }

    const osuFile = (await buffer(fileStream)).toString("utf-8");

    let requestMods: SerializedMod[];

    try {
        requestMods = JSON.parse(req.body.mods ?? "[]") as SerializedMod[];
    } catch (e) {
        return res.status(400).json({ error: "Invalid mods format" });
    }

    if (!Array.isArray(requestMods)) {
        return res.status(400).json({ error: "Invalid mods format" });
    }

    // Check if mods are valid
    for (const mod of requestMods) {
        if (typeof mod !== "object" || !mod.acronym) {
            return res.status(400).json({ error: "Invalid mods format" });
        }
    }

    const mods = ModUtil.deserializeMods(requestMods);

    const { gamemode, generatestrainchart } = req.body;
    const calculationMethod = parseInt(req.body.calculationmethod);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.live &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const beatmap = new BeatmapDecoder().decode(osuFile, gamemode).result;

    const calculationParams = new PerformanceCalculationParameters({
        accuracy: new Accuracy({
            n300: Math.max(-1, parseInt(req.body.n300 ?? "-1")),
            n100: Math.max(0, parseInt(req.body.n100 ?? "0")),
            n50: Math.max(0, parseInt(req.body.n50 ?? "0")),
            nmiss: Math.max(0, parseInt(req.body.nmiss ?? "0")),
            nobjects: beatmap.hitObjects.objects.length,
        }),
        combo: MathUtils.clamp(
            parseInt(req.body.maxcombo ?? beatmap.maxCombo.toString()),
            0,
            beatmap.maxCombo,
        ),
        tapPenalty: parseInt(req.body.tappenalty ?? "1"),
        sliderCheesePenalty: {
            aimPenalty: parseInt(req.body.aimslidercheesepenalty ?? "1"),
            flashlightPenalty: parseInt(
                req.body.flashlightslidercheesepenalty ?? "1",
            ),
        },
        sliderTickHits:
            req.body.sliderticksmissed !== undefined
                ? MathUtils.clamp(
                      0,
                      beatmap.hitObjects.sliderTicks -
                          parseInt(req.body.sliderticksmissed),
                      beatmap.hitObjects.sliderTicks,
                  )
                : undefined,
        sliderEndHits:
            req.body.sliderendsdropped !== undefined
                ? MathUtils.clamp(
                      0,
                      beatmap.hitObjects.sliders -
                          parseInt(req.body.sliderendsdropped),
                      beatmap.hitObjects.sliders,
                  )
                : undefined,
    });

    let attributes: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >;
    let strainChart: Buffer | null = null;

    switch (gamemode) {
        case Modes.droid: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const diffAttribs = calculateLocalBeatmapDifficulty(
                        beatmap,
                        mods,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffAttribs,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    if (generatestrainchart) {
                        strainChart = await generateStrainChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                mods,
                                gamemode,
                                calculationMethod,
                            ),
                            diffAttribs.clockRate,
                            { color: StrainGraphColor.droidLive },
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: diffAttribs.toCacheableAttributes(),
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
                        },
                    } as CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    break;
                }

                case PPCalculationMethod.rebalance: {
                    const diffAttribs = calculateLocalBeatmapDifficulty(
                        beatmap,
                        mods,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffAttribs,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    if (generatestrainchart) {
                        strainChart = await generateStrainChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                mods,
                                gamemode,
                                calculationMethod,
                            ),
                            diffAttribs.clockRate,
                            { color: StrainGraphColor.droidRebalance },
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: diffAttribs.toCacheableAttributes(),
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
                            estimatedUnstableRate: perfCalc.deviation * 10,
                            estimatedSpeedUnstableRate:
                                perfCalc.tapDeviation * 10,
                        },
                    } as CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
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
                    const diffAttribs = calculateLocalBeatmapDifficulty(
                        beatmap,
                        mods,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffAttribs,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    if (generatestrainchart) {
                        strainChart = await generateStrainChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                mods,
                                gamemode,
                                calculationMethod,
                            ),
                            diffAttribs.clockRate,
                            { color: StrainGraphColor.osuLive },
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: diffAttribs.toCacheableAttributes(),
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
                    const diffAttribs = calculateLocalBeatmapDifficulty(
                        beatmap,
                        mods,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffAttribs,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    if (generatestrainchart) {
                        strainChart = await generateStrainChart(
                            beatmap,
                            getStrainPeaks(
                                beatmap,
                                mods,
                                gamemode,
                                calculationMethod,
                            ),
                            diffAttribs.clockRate,
                            { color: StrainGraphColor.osuRebalance },
                        );
                    }

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: diffAttribs.toCacheableAttributes(),
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

    res.json({
        attributes: attributes,
        strainChart: strainChart?.toJSON().data,
    });
});

export default router;
