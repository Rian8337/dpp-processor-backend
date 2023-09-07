import { Router } from "express";
import { Util } from "../utils/Util";
import { join } from "path";
import { localReplayDirectory, persistReplay } from "../utils/replayManager";
import { readFile, readdir } from "fs/promises";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";

const router = Router();

router.put<
    "/",
    unknown,
    unknown,
    { key: string; playerid: number; beatmaphash: string; replayhash: string }
>("/", Util.validatePOSTInternalKey, async (req, res) => {
    const replayDirectory = join(
        localReplayDirectory,
        req.body.playerid.toString(),
        req.body.beatmaphash
    );
    const replayFiles = await readdir(replayDirectory).catch(() => null);

    for (const replayFile of replayFiles ?? []) {
        const file = await readFile(join(replayDirectory, replayFile)).catch(
            () => null
        );

        if (!file || Util.computeMD5(file) !== req.body.replayhash) {
            continue;
        }

        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = file;
        await analyzer.analyze();

        const success = await persistReplay(req.body.playerid, analyzer);

        if (!success) {
            return res.status(400).json({
                error: "Unable to persist local replay file",
            });
        }

        return res.sendStatus(200);
    }

    res.status(404).json({ error: "Replay files are non-existent" });
});

export default router;
