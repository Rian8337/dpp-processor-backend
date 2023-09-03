import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Router } from "express";
import { DPPUtil } from "../utils/DPPUtil";
import { Util } from "../utils/Util";
import { getOnlineReplay } from "../utils/replayManager";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    { key: string; uid: string; scoreids: string }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    const scoreIds = req.body.scoreids.split(",").map((v) => parseInt(v));
    const replays: ReplayAnalyzer[] = [];

    for (const scoreId of scoreIds) {
        const analyzer = new ReplayAnalyzer({
            scoreID: scoreId,
        });

        // Retrieve replay locally.
        analyzer.originalODR = await getOnlineReplay(scoreId);
        await analyzer.analyze();

        replays.push(analyzer);
    }

    const result = await DPPUtil.submitReplay(replays, parseInt(req.body.uid));

    res.json(result);
});

export default router;
