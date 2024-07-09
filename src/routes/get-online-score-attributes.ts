import { Router } from "express";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { MathUtils, Modes } from "@rian8337/osu-base";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { getOnlineReplay } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        key: string;
        gamemode: string;
        calculationmethod: string;
        scoreid: string;
    }
>("/", validateGETInternalKey, async (req, res) => {
    const { gamemode } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
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

    const analyzer = new ReplayAnalyzer({
        scoreID: parseInt(req.query.scoreid),
    });

    // Retrieve replay locally.
    analyzer.originalODR = await getOnlineReplay(req.query.scoreid);
    await analyzer.analyze().catch(() => {
        console.error(`Score of ID ${req.query.scoreid} cannot be parsed`);
    });

    const { data } = analyzer;
    if (!data) {
        return res.status(404).json({ error: "Replay not found" });
    }

    switch (gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
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

                    const attributes: CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    > = {
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
                    };

                    res.json(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayRebalancePerformance(analyzer)
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

                    const attributes: CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    > = {
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
                            calculatedUnstableRate:
                                result.calculatedUnstableRate,
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

                    const attributes: CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
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
                    };

                    res.json(attributes);

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayRebalancePerformance(analyzer)
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

                    const attributes: CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    > = {
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
