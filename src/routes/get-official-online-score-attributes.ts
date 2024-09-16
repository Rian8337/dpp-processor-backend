import { Router } from "express";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Accuracy, RankedStatus } from "@rian8337/osu-base";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { getOnlineReplay } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";
import { getBeatmap } from "../utils/cache/beatmapStorage";
import {
    getOfficialScore,
    parseOfficialScoreMods,
} from "../database/official/officialDatabaseUtil";
import { Score } from "@rian8337/osu-droid-utilities";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();
const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    Partial<{
        key: string;
        uid: string;
        hash: string;
    }>
>("/", validateGETInternalKey, async (req, res) => {
    if (!req.query.uid) {
        return res.status(400).json({ error: "Player ID is not specified" });
    }

    if (!req.query.hash) {
        return res.status(400).json({ error: "Beatmap hash is not specified" });
    }

    const score = await getOfficialScore(
        parseInt(req.query.uid),
        req.query.hash,
        false,
    );

    if (!score) {
        return res.status(404).json({ error: "Score not found" });
    }

    const scoreId = score instanceof Score ? score.scoreID : score.id;
    const analyzer = new ReplayAnalyzer({ scoreID: scoreId });

    // Retrieve replay locally.
    analyzer.originalODR = await getOnlineReplay(scoreId);

    await analyzer.analyze().catch(() => {
        console.error(`Score of ID ${scoreId.toString()} cannot be parsed`);
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

    let overrideParameters: PerformanceCalculationParameters | undefined;

    if (!data.isReplayV3()) {
        // Old replay version - fill in missing data.
        if (score instanceof Score) {
            overrideParameters = new PerformanceCalculationParameters({
                accuracy: score.accuracy,
                combo: score.combo,
                mods: score.mods,
                customSpeedMultiplier: score.speedMultiplier,
                forceAR: score.forceAR,
                forceCS: score.forceCS,
                forceHP: score.forceHP,
                forceOD: score.forceOD,
                oldStatistics: score.oldStatistics,
            });
        } else {
            const parsedMods = parseOfficialScoreMods(score.mode);

            overrideParameters = new PerformanceCalculationParameters({
                accuracy: new Accuracy({
                    n300: score.perfect,
                    n100: score.good,
                    n50: score.bad,
                    nmiss: score.miss,
                }),
                combo: score.combo,
                mods: parsedMods.mods,
                customSpeedMultiplier: parsedMods.speedMultiplier,
                forceAR: parsedMods.forceAR,
                forceCS: parsedMods.forceCS,
                forceHP: parsedMods.forceHP,
                forceOD: parsedMods.forceOD,
                oldStatistics: parsedMods.oldStatistics,
            });
        }
    }

    const calculationResult = await difficultyCalculator
        .calculateReplayPerformance(analyzer, false, overrideParameters)
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
