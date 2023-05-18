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
        filename: string;
        replayID: string;
    }
>("/", async (req, res) => {
    // Send response early
    res.send("Success");

    const { replayID } = req.body;

    // @ts-expect-error: Bad typings
    const fileStream: ReadStream = req.files.replayfile;

    const replayAnalyzer = new ReplayAnalyzer({ scoreID: parseInt(replayID) });
    replayAnalyzer.originalODR = await Util.readFile(fileStream);
    await replayAnalyzer.analyze();
    await DPPUtil.submitReplay(replayAnalyzer);
});

export default router;
