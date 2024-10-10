import { Router } from "express";
import { readFileStream, validateOfficialPOSTInternalKey } from "../utils/util";
import { ReadStream } from "fs";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { getBeatmap } from "../utils/cache/beatmapStorage";
import { RankedStatus } from "@rian8337/osu-base";

const calculator = new BeatmapDroidDifficultyCalculator();
const router = Router();

router.post<"/", unknown, { pp: number | null }, Partial<{ key: string }>>(
    "/",
    validateOfficialPOSTInternalKey,
    async (req, res) => {
        // @ts-expect-error: Bad typings
        const files = req.files as Record<string, ReadStream | undefined>;
        const replayFileStream = files.replayfile;

        if (!replayFileStream) {
            return res.json({ pp: null });
        }

        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = await readFileStream(replayFileStream);
        await analyzer.analyze().catch(() => null);

        const { data: replayData } = analyzer;

        if (!replayData) {
            return res.json({ pp: null });
        }

        // Check if beatmap is ranked or approved.
        const apiBeatmap = await getBeatmap(replayData.hash);
        if (!apiBeatmap) {
            return res.json({ pp: null });
        }

        if (
            apiBeatmap.ranked_status !== RankedStatus.ranked &&
            apiBeatmap.ranked_status !== RankedStatus.approved
        ) {
            return res.json({ pp: null });
        }

        const calcResult = await calculator
            .calculateReplayPerformance(analyzer)
            .catch(() => null);

        if (!calcResult) {
            return res.json({ pp: null });
        }

        res.json({ pp: calcResult.result.total });
    },
);

export default router;
