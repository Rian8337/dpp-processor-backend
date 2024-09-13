import { Router } from "express";
import { deleteReplays } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";
import { deleteScore } from "../utils/dppUtil";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    Partial<{ key: string; uid: string; hash: string }>
>("/", validateGETInternalKey, async (req, res) => {
    if (!req.query.uid || !req.query.hash) {
        return res.sendStatus(400);
    }

    await deleteReplays(req.query.uid, req.query.hash);
    await deleteScore(parseInt(req.query.uid), req.query.hash);

    res.sendStatus(200);
});

export default router;
