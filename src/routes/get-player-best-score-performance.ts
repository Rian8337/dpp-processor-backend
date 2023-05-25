import { Router } from "express";
import { Util } from "../utils/Util";
import { join } from "path";
import { homedir } from "os";
import { readFile, readdir } from "fs/promises";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";

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

    // The processor backend is not supposed to access the replays folder, but
    // this access will be read-only, so I guess it is fine.
    const replayDirectory = join(
        homedir(),
        "..",
        "..",
        "data",
        "dpp-replays",
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
              RawDifficultyAttributes,
              DroidPerformanceAttributes
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

        await BeatmapDroidDifficultyCalculator.applyTapPenalty(
            analyzer,
            calcResult
        );
        await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
            analyzer,
            calcResult
        );

        const { result } = calcResult;

        if (
            !bestAttribs ||
            bestAttribs.performance.total < calcResult.result.total
        ) {
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
                    visualSliderCheesePenalty: result.visualSliderCheesePenalty,
                },
            };
        }
    }

    if (!bestAttribs) {
        return res.status(500).json({ error: "Unable to get best score" });
    }

    res.json(bestAttribs);
});

export default router;
