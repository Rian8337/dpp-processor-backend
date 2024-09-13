import {
    ModUtil,
    MathUtils,
    Modes,
    Accuracy,
    BeatmapDecoder,
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
} from "../utils/calculator/LocalBeatmapDifficultyCalculator";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";
import { StrainGraphColor } from "../enums/StrainGraphColor";

const router = Router();

/**
 * Reads a file stream and returns it as a buffer.
 *
 * @param stream The stream to read.
 * @returns The buffer represented by the read stream.
 */
function readFileStream(stream: ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", reject);
        stream.on("end", () => {
            resolve(Buffer.concat(chunks));
        });
    });
}

router.post<
    "/",
    unknown,
    unknown,
    Partial<{
        key: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcecs?: string;
        forcear?: string;
        forceod?: string;
        n300?: string;
        n100?: string;
        n50?: string;
        nmiss?: string;
        maxcombo?: string;
        aimslidercheesepenalty?: string;
        tappenalty?: string;
        flashlightslidercheesepenalty?: string;
        visualslidercheesepenalty?: string;
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

    const osuFile = (await readFileStream(fileStream)).toString("utf-8");

    const mods = ModUtil.pcStringToMods(req.body.mods ?? "");
    const oldStatistics = req.body.oldstatistics !== undefined;

    const customSpeedMultiplier = MathUtils.clamp(
        parseFloat(req.body.customspeedmultiplier ?? "1"),
        0.5,
        2,
    );
    if (Number.isNaN(customSpeedMultiplier)) {
        return res
            .status(400)
            .json({ error: "Invalid custom speed multiplier" });
    }

    const forceCS = req.body.forcecs
        ? MathUtils.clamp(parseFloat(req.body.forcecs), 0, 12.5)
        : undefined;
    if (forceCS !== undefined && Number.isNaN(forceCS)) {
        return res.status(400).json({ error: "Invalid force CS" });
    }

    const forceAR = req.body.forcear
        ? MathUtils.clamp(parseFloat(req.body.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR" });
    }

    const forceOD = req.body.forceod
        ? MathUtils.clamp(parseFloat(req.body.forceod), 0, 12.5)
        : undefined;
    if (forceOD !== undefined && Number.isNaN(forceOD)) {
        return res.status(400).json({ error: "Invalid force OD" });
    }

    const { gamemode } = req.body;
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
        mods: mods,
        customSpeedMultiplier: customSpeedMultiplier,
        forceCS: forceCS,
        forceAR: forceAR,
        forceOD: forceOD,
        oldStatistics: oldStatistics,
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
            visualPenalty: parseInt(req.body.visualslidercheesepenalty ?? "1"),
        },
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
                    const diffCalc = calculateLocalBeatmapDifficulty(
                        beatmap,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffCalc,
                        calculationParams,
                    );

                    strainChart = await generateStrainChart(
                        beatmap,
                        diffCalc.strainPeaks,
                        diffCalc.difficultyStatistics.overallSpeedMultiplier,
                        undefined,
                        StrainGraphColor.droidLive,
                    );

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...perfCalc.difficultyAttributes,
                            mods: perfCalc.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
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
                    } as CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const diffCalc = calculateLocalBeatmapDifficulty(
                        beatmap,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffCalc,
                        calculationParams,
                    );

                    strainChart = await generateStrainChart(
                        beatmap,
                        diffCalc.strainPeaks,
                        diffCalc.difficultyStatistics.overallSpeedMultiplier,
                        undefined,
                        StrainGraphColor.droidRebalance,
                    );

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...perfCalc.difficultyAttributes,
                            mods: perfCalc.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
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
                    } as CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    break;
                }
            }

            break;
        }
        case Modes.osu: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const diffCalc = calculateLocalBeatmapDifficulty(
                        beatmap,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffCalc,
                        calculationParams,
                    );

                    strainChart = await generateStrainChart(
                        beatmap,
                        diffCalc.strainPeaks,
                        diffCalc.difficultyStatistics.overallSpeedMultiplier,
                        undefined,
                        StrainGraphColor.osuLive,
                    );

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...perfCalc.difficultyAttributes,
                            mods: perfCalc.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
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
                    const diffCalc = calculateLocalBeatmapDifficulty(
                        beatmap,
                        calculationParams,
                        gamemode,
                        calculationMethod,
                    );

                    const perfCalc = calculateLocalBeatmapPerformance(
                        diffCalc,
                        calculationParams,
                    );

                    strainChart = await generateStrainChart(
                        beatmap,
                        diffCalc.strainPeaks,
                        diffCalc.difficultyStatistics.overallSpeedMultiplier,
                        undefined,
                        StrainGraphColor.osuRebalance,
                    );

                    attributes = {
                        params: calculationParams.toCloneable(),
                        difficulty: {
                            ...perfCalc.difficultyAttributes,
                            mods: perfCalc.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
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
        strainChart: strainChart.toJSON().data,
    });
});

export default router;
