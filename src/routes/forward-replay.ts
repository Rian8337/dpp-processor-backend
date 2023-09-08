import { Router } from "express";
import { Util } from "../utils/Util";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { DPPUtil } from "../utils/DPPUtil";
import {
    deleteUnprocessedReplay,
    getUnprocessedReplay,
} from "../utils/replayManager";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    {
        key: string;
        replayId: string;
        filename: string;
    }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    // Send response early
    res.sendStatus(200);

    const { replayId } = req.body;

    const replayAnalyzer = new ReplayAnalyzer({ scoreID: parseInt(replayId) });
    replayAnalyzer.originalODR = await getUnprocessedReplay(req.body.filename);
    await replayAnalyzer.analyze().catch(() => {});

    const result = await DPPUtil.submitReplay(
        [replayAnalyzer],
        undefined,
        true
    ).catch(() => null);

    if (result) {
        await deleteUnprocessedReplay(req.body.filename);
    }
});

export default router;
