import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Router } from "express";
import { validatePOSTInternalKey } from "../utils/util";
import { getOnlineReplay } from "../utils/replayManager";
import { submitReplay } from "../utils/dppUtil";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    { key: string; uid: string; scoreids: string }
>("/", validatePOSTInternalKey, async (req, res) => {
    const scoreIds = req.body.scoreids.split(",").map((v) => parseInt(v));
    const replays: ReplayAnalyzer[] = [];

    for (const scoreId of scoreIds) {
        const analyzer = new ReplayAnalyzer({
            scoreID: scoreId,
        });

        // Retrieve replay locally.
        analyzer.originalODR = await getOnlineReplay(scoreId);
        await analyzer.analyze().catch(() => {
            console.error(`Score of ID ${scoreId.toString()} cannot be parsed`);
        });

        replays.push(analyzer);
    }

    const result = await submitReplay(replays, parseInt(req.body.uid));

    res.json(result);
});

export default router;
