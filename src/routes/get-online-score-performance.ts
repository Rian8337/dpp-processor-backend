import { Router } from "express";
import { Util } from "../utils/Util";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { getOnlineReplay } from "../utils/replayBackendManager";
import { Modes } from "@rian8337/osu-base";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    { key: string; mode: Modes; calculationmethod: string; scoreid: string }
>("/", Util.validateGETInternalKey, async (req, res) => {
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

    switch (req.query.mode) {
        case Modes.droid: {
            const calculationResult =
                await new BeatmapDroidDifficultyCalculator().calculateReplayPerformance(
                    analyzer
                );

            if (!calculationResult) {
                return res
                    .status(400)
                    .json({ error: "Unable to calculate replay" });
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

            const attributes: DroidPerformanceAttributes = {
                total: result.total,
                aim: result.aim,
                tap: result.tap,
                accuracy: result.accuracy,
                flashlight: result.flashlight,
                visual: result.visual,
            };

            res.json(attributes);

            break;
        }
        case Modes.osu: {
            const calculationResult =
                await new BeatmapOsuDifficultyCalculator().calculateReplayPerformance(
                    analyzer
                );

            if (!calculationResult) {
                return res
                    .status(400)
                    .json({ error: "Unable to calculate replay" });
            }

            const { result } = calculationResult;

            const attributes: OsuPerformanceAttributes = {
                total: result.total,
                aim: result.aim,
                speed: result.speed,
                accuracy: result.accuracy,
                flashlight: result.flashlight,
            };

            res.json(attributes);

            break;
        }
    }
});

export default router;
