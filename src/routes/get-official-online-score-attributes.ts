import { Router } from "express";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { RankedStatus } from "@rian8337/osu-base";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { getOnlineReplay } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";
import { getBeatmap } from "../utils/cache/beatmapStorage";

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();
const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        key: string;
        scoreid: string;
    }
>("/", validateGETInternalKey, async (req, res) => {
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

    const apiBeatmap = await getBeatmap(data.hash);
    if (!apiBeatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    // Only allow ranked and approved beatmaps.
    if (
        apiBeatmap.ranked_status !== RankedStatus.ranked &&
        apiBeatmap.ranked_status !== RankedStatus.approved
    ) {
        return res
            .status(400)
            .json({ error: "Beatmap is not ranked or approved" });
    }

    const calculationResult = await difficultyCalculator
        .calculateReplayPerformance(analyzer)
        .catch((e: unknown) => {
            console.log(
                "Calculation failed for URL:",
                req.url.replace(process.env.DROID_SERVER_INTERNAL_KEY!, ""),
            );
            console.error(e);

            return e instanceof Error ? e.message : "Calculation failed";
        });

    if (typeof calculationResult === "string") {
        return res.status(503).json({ error: calculationResult });
    }

    res.json({
        pp: calculationResult.result.total,
    });
});

export default router;
