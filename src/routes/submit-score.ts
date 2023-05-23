import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Router } from "express";
import { DPPUtil } from "../utils/DPPUtil";
import { Util } from "../utils/Util";
import { getOnlineReplay } from "../utils/replayBackendManager";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    { key: string; uid: string; scoreid: string }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    const analyzer = new ReplayAnalyzer({
        scoreID: parseInt(req.body.scoreid),
    });

    // Retrieve replay locally.
    analyzer.originalODR = await getOnlineReplay(req.body.scoreid);
    await analyzer.analyze();

    const { data } = analyzer;
    if (!data) {
        return res.status(404).json({ error: "Replay not found." });
    }

    const status = await DPPUtil.submitReplay(analyzer, parseInt(req.body.uid));

    if (!status.success) {
        return res.status(400).json({ error: status.reason });
    }

    if (status.replayNeedsPersistence) {
        const formData = new FormData();
        formData.append("uid", req.body.uid);
        formData.append("scoreId", req.body.scoreid);

        const persistResponse = await fetch(
            "http://127.0.0.1:3005/persist-online-replay",
            {
                method: "POST",
                body: formData,
            }
        ).catch(() => null);

        if (!persistResponse || persistResponse.status !== 200) {
            res.status(persistResponse?.status ?? 400);

            const json = await persistResponse?.json();
            return res.json(json ?? { error: "Replay persisting failed" });
        }
    }

    res.json(status);
});

export default router;
