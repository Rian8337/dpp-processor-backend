import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Router } from "express";
import { DPPUtil } from "../utils/DPPUtil";

const router = Router();

router.post<"/", unknown, unknown, { uid: string; scoreId: string }>(
    "/",
    async (req, res) => {
        const analyzer = new ReplayAnalyzer({
            scoreID: parseInt(req.body.scoreId),
        });
        await analyzer.analyze();

        const { data } = analyzer;
        if (!data) {
            return res.status(404).json({ error: "Replay not found." });
        }

        const status = await DPPUtil.submitReplay(
            analyzer,
            parseInt(req.body.uid)
        );

        if (!status.success) {
            res.status(400);
        }

        res.json(status);
    }
);

export default router;
