import { Router } from "express";
import { Util } from "../utils/Util";
import { deleteReplays } from "../utils/replaySavingManager";
import { DPPUtil } from "../utils/DPPUtil";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    { key: string; uid: string; hash: string }
>("/", Util.validateGETInternalKey, async (req, res) => {
    if (!req.query.uid || !req.query.hash) {
        return res.sendStatus(400);
    }

    await deleteReplays(req.query.uid, req.query.hash);
    await DPPUtil.deleteScore(parseInt(req.query.uid), req.query.hash);

    res.sendStatus(200);
});

export default router;
