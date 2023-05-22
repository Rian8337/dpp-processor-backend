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
            return res.status(400).json({ error: status.reason });
        }

        if (status.replayNeedsPersistence) {
            const formData = new FormData();
            formData.append("uid", req.body.uid);
            formData.append("scoreId", req.body.scoreId);

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
    }
);

export default router;
