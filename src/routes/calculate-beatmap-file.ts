import {
    ModUtil,
    MathUtils,
    Modes,
    Accuracy,
    MapStats,
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
import { Router } from "express";
import { ReadStream } from "fs";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { LocalBeatmapDifficultyCalculator } from "../utils/calculator/LocalBeatmapDifficultyCalculator";
import { Util } from "../utils/Util";

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
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

router.post<
    "/",
    unknown,
    unknown,
    {
        key: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcear?: string;
        n300: string;
        n100: string;
        n50: string;
        nmiss: string;
        maxcombo: string;
        aimslidercheesepenalty?: string;
        tappenalty?: string;
        flashlightslidercheesepenalty?: string;
        visualslidercheesepenalty?: string;
    }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    // @ts-expect-error: Bad typings
    const fileStream: ReadStream = req.files.file;

    if (!fileStream) {
        return res.status(400).json({ error: "Beatmap not found" });
    }

    const osuFile = (await readFileStream(fileStream)).toString("utf-8");

    const mods = ModUtil.pcStringToMods(req.body.mods ?? "");
    const oldStatistics = req.body.oldstatistics !== undefined;

    const customSpeedMultiplier = MathUtils.clamp(
        parseFloat(req.body.customspeedmultiplier ?? "1"),
        0.5,
        2
    );
    if (Number.isNaN(customSpeedMultiplier)) {
        return res
            .status(400)
            .json({ error: "Invalid custom speed multiplier" });
    }

    const forceAR = req.body.forcear
        ? MathUtils.clamp(parseFloat(req.body.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR" });
    }

    const { gamemode } = req.body;
    const calculationMethod = parseInt(req.body.calculationmethod);

    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const beatmap = new BeatmapDecoder().decode(osuFile, mods).result;

    const calculationParams = new PerformanceCalculationParameters(
        new Accuracy({
            n300: Math.max(0, parseInt(req.body.n300)),
            n100: Math.max(0, parseInt(req.body.n100)),
            n50: Math.max(0, parseInt(req.body.n50)),
            nmiss: Math.max(0, parseInt(req.body.nmiss)),
        }),
        MathUtils.clamp(parseInt(req.body.maxcombo), 0, beatmap.maxCombo),
        parseInt(req.body.tappenalty ?? "1"),
        new MapStats({
            mods: mods,
            ar: forceAR,
            speedMultiplier: customSpeedMultiplier,
            isForceAR: forceAR !== undefined && !isNaN(forceAR),
            oldStatistics: oldStatistics,
        }),
        {
            aimPenalty: parseInt(req.body.aimslidercheesepenalty ?? "1"),
            flashlightPenalty: parseInt(
                req.body.flashlightslidercheesepenalty ?? "1"
            ),
            visualPenalty: parseInt(req.body.visualslidercheesepenalty ?? "1"),
        }
    );

    switch (gamemode) {
        case Modes.droid: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const result =
                        LocalBeatmapDifficultyCalculator.calculatePerformance(
                            LocalBeatmapDifficultyCalculator.calculateDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod
                            ),
                            calculationParams
                        );

                    const attributes: CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    > = {
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: undefined,
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
                    };

                    res.json(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const result =
                        LocalBeatmapDifficultyCalculator.calculatePerformance(
                            LocalBeatmapDifficultyCalculator.calculateDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod
                            ),
                            calculationParams
                        );

                    const attributes: CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    > = {
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: undefined,
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
                    };

                    res.json(attributes);

                    break;
                }
            }

            break;
        }
        case Modes.osu: {
            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const result =
                        LocalBeatmapDifficultyCalculator.calculatePerformance(
                            LocalBeatmapDifficultyCalculator.calculateDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod
                            ),
                            calculationParams
                        );

                    const attributes: CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: undefined,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    };

                    res.json(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const result =
                        LocalBeatmapDifficultyCalculator.calculatePerformance(
                            LocalBeatmapDifficultyCalculator.calculateDifficulty(
                                beatmap,
                                calculationParams,
                                gamemode,
                                calculationMethod
                            ),
                            calculationParams
                        );

                    const attributes: CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
                        difficulty: {
                            ...result.difficultyAttributes,
                            mods: undefined,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    };

                    res.json(attributes);

                    break;
                }
            }

            break;
        }
    }
});

export default router;
