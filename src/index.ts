import express, { Router } from "express";
import cors from "cors";
import formData from "express-form-data";
import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import calculateBeatmapFile from "./routes/calculate-beatmap-file";
import calculatePersistedReplay from "./routes/calculate-persisted-replay";
import deleteReplays from "./routes/delete-replays";
import getDifficultyAttributes from "./routes/get-difficulty-attributes";
import getPerformanceAttributes from "./routes/get-performance-attributes";
import getPlayerBestScorePerformance from "./routes/get-player-best-score-performance";
import getOnlineScoreAttributes from "./routes/get-online-score-attributes";
import persistLocalReplay from "./routes/persist-local-replay";
import persistOnlineReplay from "./routes/persist-online-replay";
import submitScores from "./routes/submit-scores";
import { DPPUtil } from "./utils/DPPUtil";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { mkdir } from "fs/promises";

config();

const baseRouter = Router()
    .use("/calculate-beatmap-file", calculateBeatmapFile)
    .use("/calculate-persisted-replay", calculatePersistedReplay)
    .use("/delete-replays", deleteReplays)
    .use("/get-difficulty-attributes", getDifficultyAttributes)
    .use("/get-performance-attributes", getPerformanceAttributes)
    .use("/get-player-best-score-performance", getPlayerBestScorePerformance)
    .use("/get-online-score-attributes", getOnlineScoreAttributes)
    .use("/persist-local-replay", persistLocalReplay)
    .use("/persist-online-replay", persistOnlineReplay)
    .use("/submit-scores", submitScores);

const app = express()
    .set("trust proxy", 1)
    .use(cors())
    .use(formData.parse())
    .use(formData.format())
    .use(formData.stream())
    .use(express.json())
    .use(express.urlencoded({ extended: true }))
    .use("/api/dpp/processor", baseRouter);

Promise.all([
    DatabaseManager.init(),
    processorPool.connect(),
    mkdir("beatmaps", { recursive: true }),
])
    .then(async () => {
        const port = parseInt(process.env.PORT || "3006");

        app.listen(port, () => console.log("DPP processor backend is up"));

        await DPPUtil.initiateReplayProcessing();
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
