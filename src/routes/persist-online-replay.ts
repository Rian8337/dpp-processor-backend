import { Router } from "express";
import {
    getOnlineReplay,
    persistReplayToDppSystem,
} from "../utils/replayManager";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { validatePOSTInternalKey } from "../utils/util";

const router = Router();

router.put<
    "/",
    unknown,
    unknown,
    Partial<{ key: string; uid: number; scoreid: number }>
>("/", validatePOSTInternalKey, async (req, res) => {
    if (!req.body.uid) {
        return res.status(400).json({ error: "Player ID is not specified" });
    }

    if (!req.body.scoreid) {
        return res.status(400).json({ error: "Score ID is not specified" });
    }

    const analyzer = new ReplayAnalyzer({
        scoreID: req.body.scoreid,
    });
    analyzer.originalODR = await getOnlineReplay(req.body.scoreid);
    await analyzer.analyze().catch(() => {
        console.error(
            `Score of ID ${req.body.scoreid!.toString()} cannot be parsed`,
        );
    });

    const success = await persistReplayToDppSystem(req.body.uid, analyzer);
    if (!success) {
        return res
            .status(400)
            .json({ error: "Unable to persist online replay file" });
    }

    res.sendStatus(200);
});

export default router;
