import { Router } from "express";
import { join } from "path";
import {
    localReplayDirectory,
    persistReplayToDppSystem,
} from "../utils/replayManager";
import { readFile, readdir } from "fs/promises";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { computeMD5, validatePOSTInternalKey } from "../utils/util";

const router = Router();

router.put<
    "/",
    unknown,
    unknown,
    { key: string; playerid: number; beatmaphash: string; replayhash: string }
>("/", validatePOSTInternalKey, async (req, res) => {
    const replayDirectory = join(
        localReplayDirectory,
        req.body.playerid.toString(),
        req.body.beatmaphash,
    );
    const replayFiles = await readdir(replayDirectory).catch(() => null);

    for (const replayFile of replayFiles ?? []) {
        const file = await readFile(join(replayDirectory, replayFile)).catch(
            () => null,
        );

        if (!file || computeMD5(file) !== req.body.replayhash) {
            continue;
        }

        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = file;

        await analyzer.analyze().catch(() => {
            console.error(
                `Score of uid ${req.body.playerid.toString()} from beatmap ${req.body.beatmaphash} cannot be parsed`,
            );
        });

        const success = await persistReplayToDppSystem(
            req.body.playerid,
            analyzer,
        );

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
