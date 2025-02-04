import express, { Router } from "express";
import cors from "cors";
import formData from "express-form-data";
import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import calculateBeatmapFile from "./routes/calculate-beatmap-file";
import getDifficultyAttributes from "./routes/get-difficulty-attributes";
import getPerformanceAttributes from "./routes/get-performance-attributes";
import getOnlineScoreAttributes from "./routes/get-online-score-attributes";
import { initiateReplayProcessing } from "./utils/dppUtil";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import {
    DroidAPIRequestBuilder,
    OsuAPIRequestBuilder,
} from "@rian8337/osu-base";

config();

DroidAPIRequestBuilder.setAPIKey(process.env.DROID_API_KEY!);
OsuAPIRequestBuilder.setAPIKey(process.env.OSU_API_KEY!);

const baseRouter = Router()
    .use("/calculate-beatmap-file", calculateBeatmapFile)
    .use("/get-difficulty-attributes", getDifficultyAttributes)
    .use("/get-performance-attributes", getPerformanceAttributes)
    .use("/get-online-score-attributes", getOnlineScoreAttributes);

const app = express()
    .set("trust proxy", 1)
    .use(cors())
    .use(formData.parse())
    .use(formData.format())
    .use(formData.stream())
    .use(express.json())
    .use(express.urlencoded({ extended: true }))
    .use("/api/dpp/processor", baseRouter);

Promise.all([DatabaseManager.init(), processorPool.connect()])
    .then(async () => {
        const port = parseInt(process.env.PORT ?? "3006");

        app.listen(port, () => {
            console.log("DPP processor backend is up");
        });

        await initiateReplayProcessing();
    })
    .catch((e: unknown) => {
        console.error(e);
        process.exit(1);
    });
