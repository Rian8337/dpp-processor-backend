import { Router } from "express";
import { getOnlineReplay, persistReplay } from "../utils/replayManager";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Util } from "../utils/Util";

const router = Router();

router.put<
    "/",
    unknown,
    unknown,
    { key: string; uid: string; scoreid: string }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    const analyzer = new ReplayAnalyzer({
        scoreID: parseInt(req.body.scoreid),
    });
    analyzer.originalODR = await getOnlineReplay(req.body.scoreid);

    const success = await persistReplay(parseInt(req.body.uid), analyzer);
    if (!success) {
        return res
            .status(400)
            .json({ error: "Unable to persist online replay file" });
    }

    res.sendStatus(200);
});

export default router;
