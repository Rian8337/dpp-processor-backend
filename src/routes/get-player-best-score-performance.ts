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
import { getOnlineReplay, localReplayDirectory } from "../utils/replayManager";
import { Score } from "@rian8337/osu-droid-utilities";
import { DPPUtil } from "../utils/DPPUtil";

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

    let bestAttribs: CompleteCalculationAttributes<
        DroidDifficultyAttributes | RebalanceDroidDifficultyAttributes,
        DroidPerformanceAttributes | RebalanceDroidPerformanceAttributes
    > | null = null;
    const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

    const calculateReplay = async (analyzer: ReplayAnalyzer) => {
        if (!analyzer.originalODR) {
            return;
        }

        await analyzer.analyze().catch(() => {
            console.error(
                `Score of uid ${req.query.playerid} from beatmap ${req.query.beatmaphash} cannot be parsed`
            );
        });

        const calcResult = await (calculationMethod === PPCalculationMethod.live
            ? difficultyCalculator.calculateReplayPerformance(analyzer)
            : difficultyCalculator.calculateReplayRebalancePerformance(analyzer)
        ).catch((e: Error) => {
            console.log(
                "Calculation failed for URL:",
                req.url.replace(process.env.DROID_SERVER_INTERNAL_KEY!, "")
            );
            console.error(e);

            return e.message;
        });

        if (typeof calcResult === "string") {
            return;
        }

        const { result } = calcResult;

        if (bestAttribs && bestAttribs.performance.total >= result.total) {
            return;
        }

        if (calculationMethod === PPCalculationMethod.live) {
            bestAttribs = {
                params: calcResult.params.toCloneable(),
                difficulty: {
                    ...calcResult.difficultyAttributes,
                    mods: calcResult.difficultyAttributes.mods.reduce(
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
                    aimSliderCheesePenalty: result.aimSliderCheesePenalty,
                    flashlightSliderCheesePenalty:
                        result.flashlightSliderCheesePenalty,
                    visualSliderCheesePenalty: result.visualSliderCheesePenalty,
                },
                replay: calcResult.replay,
            };
        } else {
            bestAttribs = {
                params: calcResult.params.toCloneable(),
                difficulty: {
                    ...calcResult.difficultyAttributes,
                    mods: calcResult.difficultyAttributes.mods.reduce(
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
                    aimSliderCheesePenalty: result.aimSliderCheesePenalty,
                    flashlightSliderCheesePenalty:
                        result.flashlightSliderCheesePenalty,
                    visualSliderCheesePenalty: result.visualSliderCheesePenalty,
                    calculatedUnstableRate: (
                        result as RebalanceDroidPerformanceAttributes
                    ).calculatedUnstableRate,
                    estimatedUnstableRate: MathUtils.round(
                        result.deviation * 10,
                        2
                    ),
                    estimatedSpeedUnstableRate: MathUtils.round(
                        result.tapDeviation * 10,
                        2
                    ),
                },
                replay: calcResult.replay,
            };
        }

        if (analyzer.scoreID === 0) {
            bestAttribs.localReplayMD5 = Util.computeMD5(analyzer.originalODR);
        }
    };

    // Check for online replay first in case it is not submitted to the local replay directory.
    const score = await DPPUtil.getScore(
        parseInt(req.query.playerid),
        req.query.beatmaphash,
        "id"
    );

    if (!score) {
        return res.status(404).json({ error: "No scores found from player" });
    }

    const analyzer = new ReplayAnalyzer({
        scoreID: score instanceof Score ? score.scoreID : score.id,
    });

    // Retrieve replay locally.
    analyzer.originalODR = await getOnlineReplay(analyzer.scoreID);
    await calculateReplay(analyzer);

    // After checking the online score, we check local replay directory.
    const replayDirectory = join(
        localReplayDirectory,
        req.query.playerid,
        req.query.beatmaphash
    );
    const replayFiles = await readdir(replayDirectory).catch(() => null);

    for (const replayFilename of replayFiles ?? []) {
        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = await readFile(
            join(replayDirectory, replayFilename)
        ).catch(() => null);
        await calculateReplay(analyzer);
    }

    if (!bestAttribs) {
        return res.status(500).json({ error: "Unable to get best score" });
    }

    res.json(bestAttribs);
});

export default router;
