import { Router } from "express";
import { Util } from "../utils/Util";
import { join } from "path";
import { readFile, readdir } from "fs/promises";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { MathUtils } from "@rian8337/osu-base";
import { DroidDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { BeatmapDifficultyCalculator } from "../utils/calculator/BeatmapDifficultyCalculator";
import { localReplayDirectory } from "../utils/replaySavingManager";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        key: string;
        playerid: string;
        beatmaphash: string;
        calculationmethod: string;
    }
>("/", Util.validateGETInternalKey, async (req, res) => {
    const calculationMethod = parseInt(req.query.calculationmethod);
    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    const replayDirectory = join(
        localReplayDirectory,
        req.query.playerid,
        req.query.beatmaphash
    );
    const replayFiles = await readdir(replayDirectory).catch(() => null);

    if (!replayFiles) {
        return res.status(404).json({ error: "No scores found from player" });
    }

    const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

    let bestAttribs:
        | CompleteCalculationAttributes<
              DroidDifficultyAttributes | RebalanceDroidDifficultyAttributes,
              DroidPerformanceAttributes | RebalanceDroidPerformanceAttributes
          >
        | undefined;

    for (const replayFilename of replayFiles) {
        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = await readFile(
            join(replayDirectory, replayFilename)
        ).catch(() => null);

        if (!analyzer.originalODR) {
            continue;
        }

        await analyzer.analyze();

        const calcResult = await (calculationMethod === PPCalculationMethod.live
            ? difficultyCalculator.calculateReplayPerformance(analyzer)
            : difficultyCalculator.calculateReplayRebalancePerformance(
                  analyzer
              ));

        if (!calcResult) {
            continue;
        }

        const tapPenaltyResult =
            await BeatmapDroidDifficultyCalculator.applyTapPenalty(
                analyzer,
                calcResult
            );

        if (!tapPenaltyResult) {
            continue;
        }

        const sliderCheesePenaltyResult =
            await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                analyzer,
                calcResult
            );

        if (!sliderCheesePenaltyResult) {
            continue;
        }

        const { result } = calcResult;

        if (
            !bestAttribs ||
            bestAttribs.performance.total < calcResult.result.total
        ) {
            if (calculationMethod === PPCalculationMethod.live) {
                bestAttribs = {
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
                        aimSliderCheesePenalty: result.aimSliderCheesePenalty,
                        flashlightSliderCheesePenalty:
                            result.flashlightSliderCheesePenalty,
                        visualSliderCheesePenalty:
                            result.visualSliderCheesePenalty,
                    },
                };
            } else {
                bestAttribs = {
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
                        aimSliderCheesePenalty: result.aimSliderCheesePenalty,
                        flashlightSliderCheesePenalty:
                            result.flashlightSliderCheesePenalty,
                        visualSliderCheesePenalty:
                            result.visualSliderCheesePenalty,
                        calculatedUnstableRate:
                            (analyzer.calculateHitError()?.unstableRate ?? 0) /
                            (BeatmapDifficultyCalculator.getCalculationParameters(
                                analyzer
                            ).customStatistics?.calculate().speedMultiplier ??
                                1),
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
            }
        }
    }

    if (!bestAttribs) {
        return res.status(500).json({ error: "Unable to get best score" });
    }

    res.json(bestAttribs);
});

export default router;
