import {
    ModUtil,
    MathUtils,
    Modes,
    MapStats,
    Accuracy,
} from "@rian8337/osu-base";
import { Router } from "express";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { getBeatmap } from "../utils/cache/beatmapStorage";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        key: string;
        beatmapid?: string;
        beatmaphash?: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcear?: string;
        n300?: string;
        n100?: string;
        n50?: string;
        nmiss?: string;
        maxcombo?: string;
        aimslidercheesepenalty?: string;
        tappenalty?: string;
        flashlightslidercheesepenalty?: string;
        visualslidercheesepenalty?: string;
    }
>("/", async (req, res) => {
    if (!req.query.beatmapid && !req.query.beatmaphash) {
        return res
            .status(400)
            .json({ error: "Neither beatmap ID or hash is specified" });
    }

    const mods = ModUtil.pcStringToMods(req.query.mods ?? "");
    const oldStatistics = req.query.oldstatistics !== undefined;

    const customSpeedMultiplier = MathUtils.clamp(
        parseFloat(req.query.customspeedmultiplier ?? "1"),
        0.5,
        2
    );
    if (Number.isNaN(customSpeedMultiplier)) {
        return res
            .status(400)
            .json({ error: "Invalid custom speed multiplier" });
    }

    const forceAR = req.query.forcear
        ? MathUtils.clamp(parseFloat(req.query.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR" });
    }

    const { beatmapid, beatmaphash, gamemode } = req.query;
    const calculationMethod = parseInt(req.query.calculationmethod);

    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const beatmap = await getBeatmap(
        beatmapid !== undefined ? parseInt(beatmapid) : beatmaphash!,
        {
            checkFile: false,
        }
    );

    if (!beatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    const calculationParams = new PerformanceCalculationParameters(
        new Accuracy({
            n300: Math.max(
                0,
                parseInt(req.query.n300 ?? beatmap.objects.toString())
            ),
            n100: Math.max(0, parseInt(req.query.n100 ?? "0")),
            n50: Math.max(0, parseInt(req.query.n50 ?? "0")),
            nmiss: Math.max(0, parseInt(req.query.nmiss ?? "0")),
        }),
        MathUtils.clamp(
            parseInt(req.query.maxcombo ?? beatmap.maxCombo.toString()),
            0,
            beatmap.maxCombo
        ),
        parseInt(req.query.tappenalty ?? "1"),
        new MapStats({
            mods: mods,
            ar: forceAR,
            speedMultiplier: customSpeedMultiplier,
            isForceAR: forceAR !== undefined && !isNaN(forceAR),
            oldStatistics: oldStatistics,
        }),
        {
            aimPenalty: parseInt(req.query.aimslidercheesepenalty ?? "1"),
            flashlightPenalty: parseInt(
                req.query.flashlightslidercheesepenalty ?? "1"
            ),
            visualPenalty: parseInt(req.query.visualslidercheesepenalty ?? "1"),
        }
    );

    switch (gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult =
                        await difficultyCalculator.calculateBeatmapPerformance(
                            beatmap,
                            calculationParams
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    const { result } = calculationResult;

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
                        },
                    };

                    res.json(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult =
                        await difficultyCalculator.calculateBeatmapRebalancePerformance(
                            beatmap,
                            calculationParams
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    const { result } = calculationResult;

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
                        },
                    };

                    res.json(attributes);

                    break;
                }
            }

            break;
        }
        case Modes.osu: {
            const difficultyCalculator = new BeatmapOsuDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult =
                        await difficultyCalculator.calculateBeatmapPerformance(
                            beatmap,
                            calculationParams
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    const { result } = calculationResult;

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
                    const calculationResult =
                        await difficultyCalculator.calculateBeatmapRebalancePerformance(
                            beatmap,
                            calculationParams
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    const { result } = calculationResult;

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
