import { Router } from "express";
import { ReadStream } from "fs";
import { Util } from "../utils/Util";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { DPPUtil } from "../utils/DPPUtil";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    {
        key: string;
        filename: string;
        replayID: string;
    }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    // Send response early
    res.send("Success");

    const { replayID } = req.body;

    // @ts-expect-error: Bad typings
    const fileStream: ReadStream = req.files.replayfile;

    const replayAnalyzer = new ReplayAnalyzer({ scoreID: parseInt(replayID) });
    replayAnalyzer.originalODR = await Util.readFile(fileStream);
    await replayAnalyzer.analyze();

    const status = await DPPUtil.submitReplay(replayAnalyzer);
    if (status.success && status.replayNeedsPersistence) {
        // Request the replay server to persist the replay.
        const formData = new FormData();
        formData.append("filename", req.body.filename);

        await fetch("http://127.0.0.1:3005/persist-local-replay", {
            method: "POST",
            body: formData,
        }).catch(() => null);
    }
});

export default router;
