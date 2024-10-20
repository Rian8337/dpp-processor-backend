import { Router } from "express";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import {
    IModApplicableToDroid,
    MathUtils,
    Mod,
    ModUtil,
    Modes,
} from "@rian8337/osu-base";
import { getDppSystemPersistedReplay } from "../utils/replayManager";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { validateGETInternalKey } from "../utils/util";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    Partial<{
        key: string;
        playerid: string;
        beatmaphash: string;
        mods: string;
        customspeedmultiplier: string;
        gamemode: string;
        calculationmethod: string;
        generatestrainchart?: string;
    }>
>("/", validateGETInternalKey, async (req, res) => {
    const { playerid, beatmaphash, gamemode } = req.query;

    if (!playerid) {
        return res.status(400).json({ error: "Player ID is required" });
    }

    if (!beatmaphash) {
        return res.status(400).json({ error: "Beatmap hash is required" });
    }

    if (!req.query.mods) {
        return res.status(400).json({ error: "Mods are required" });
    }

    if (!req.query.customspeedmultiplier) {
        return res
            .status(400)
            .json({ error: "Custom speed multiplier is required" });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (!req.query.calculationmethod) {
        return res
            .status(400)
            .json({ error: "Calculation method is required" });
    }

    const calculationMethod = parseInt(req.query.calculationmethod);
    if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.live &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const generateStrainChart = req.query.generatestrainchart !== undefined;
    const analyzer = new ReplayAnalyzer({
        scoreID: 0,
    });

    analyzer.originalODR = await getDppSystemPersistedReplay(
        parseInt(playerid),
        beatmaphash,
        ModUtil.pcStringToMods(req.query.mods) as (Mod &
            IModApplicableToDroid)[],
        parseInt(req.query.customspeedmultiplier),
    );

    if (!analyzer.originalODR) {
        return res.status(404).json({ error: "Replay not found" });
    }

    await analyzer.analyze();

    let attributes: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >;
    let strainChart: Buffer | null = null;

    switch (gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            analyzer,
                            generateStrainChart,
                        )
                        .catch((e: unknown) => {
                            console.log(
                                "Calculation failed for URL:",
                                req.url.replace(
                                    process.env.DROID_SERVER_INTERNAL_KEY!,
                                    "",
                                ),
                            );
                            console.error(e);

                            return e instanceof Error
                                ? e.message
                                : "Calculation failed";
                        });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
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
                        replay: calculationResult.replay,
                    } as CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayRebalancePerformance(
                            analyzer,
                            generateStrainChart,
                        )
                        .catch((e: unknown) => {
                            console.log(
                                "Calculation failed for URL:",
                                req.url.replace(
                                    process.env.DROID_SERVER_INTERNAL_KEY!,
                                    "",
                                ),
                            );
                            console.error(e);

                            return e instanceof Error
                                ? e.message
                                : "Calculation failed";
                        });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
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
                            calculatedUnstableRate: 0,
                            estimatedUnstableRate: MathUtils.round(
                                result.deviation * 10,
                                2,
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                result.tapDeviation * 10,
                                2,
                            ),
                        },
                        replay: calculationResult.replay,
                    } as CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
            }

            break;
        }
        case Modes.osu: {
            const difficultyCalculator = new BeatmapOsuDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            analyzer,
                            generateStrainChart,
                        )
                        .catch((e: unknown) => {
                            console.log(
                                "Calculation failed for URL:",
                                req.url.replace(
                                    process.env.DROID_SERVER_INTERNAL_KEY!,
                                    "",
                                ),
                            );
                            console.error(e);

                            return e instanceof Error
                                ? e.message
                                : "Calculation failed";
                        });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    } as CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayPerformance(analyzer)
                        .catch((e: unknown) => {
                            console.log(
                                "Calculation failed for URL:",
                                req.url.replace(
                                    process.env.DROID_SERVER_INTERNAL_KEY!,
                                    "",
                                ),
                            );
                            console.error(e);

                            return e instanceof Error
                                ? e.message
                                : "Calculation failed";
                        });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    } as CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
            }

            break;
        }
    }

    res.json({
        attributes: attributes,
        strainChart: strainChart?.toJSON().data ?? null,
    });
});

export default router;
