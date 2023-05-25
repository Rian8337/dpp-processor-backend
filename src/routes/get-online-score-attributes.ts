import { Router } from "express";
import { Util } from "../utils/Util";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { getOnlineReplay } from "../utils/replayBackendManager";
import { MapStats, MathUtils, Modes } from "@rian8337/osu-base";
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
import { BeatmapDifficultyCalculator } from "../utils/calculator/BeatmapDifficultyCalculator";

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
>("/", Util.validateGETInternalKey, async (req, res) => {
    if (
        req.query.gamemode !== Modes.droid &&
        req.query.gamemode !== Modes.osu
    ) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    const calculationMethod = parseInt(req.query.calculationmethod);

    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const analyzer = new ReplayAnalyzer({
        scoreID: parseInt(req.query.scoreid),
    });

    // Retrieve replay locally.
    analyzer.originalODR = await getOnlineReplay(req.query.scoreid);
    await analyzer.analyze();

    const { data } = analyzer;
    if (!data) {
        return res.status(404).json({ error: "Replay not found" });
    }

    switch (req.query.gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult =
                        await difficultyCalculator.calculateReplayPerformance(
                            analyzer
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    await BeatmapDroidDifficultyCalculator.applyTapPenalty(
                        analyzer,
                        calculationResult
                    );
                    await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                        analyzer,
                        calculationResult
                    );

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
                    const calculationResult =
                        await difficultyCalculator.calculateReplayRebalancePerformance(
                            analyzer
                        );

                    if (!calculationResult) {
                        return res
                            .status(503)
                            .json({ error: "Unable to calculate beatmap" });
                    }

                    await BeatmapDroidDifficultyCalculator.applyTapPenalty(
                        analyzer,
                        calculationResult
                    );
                    await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                        analyzer,
                        calculationResult
                    );

                    const { result } = calculationResult;

                    const attributes: CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
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
                            calculatedUnstableRate:
                                (analyzer.calculateHitError()?.unstableRate ??
                                    0) /
                                (BeatmapDifficultyCalculator.getCalculationParameters(
                                    analyzer
                                ).customStatistics?.calculate()
                                    .speedMultiplier ?? 1),
                            estimatedUnstableRate: MathUtils.round(
                                result.deviation * 10,
                                2
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                result.tapDeviation * 10,
                                2
                            ),
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
                        await difficultyCalculator.calculateReplayPerformance(
                            analyzer
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
                        await difficultyCalculator.calculateReplayRebalancePerformance(
                            analyzer
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
