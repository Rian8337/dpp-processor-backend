import {
    DroidAPIRequestBuilder,
    OsuAPIRequestBuilder,
} from "@rian8337/osu-base";
import cors from "cors";
import { config } from "dotenv";
import express, { Router } from "express";
import formData from "express-form-data";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import calculateBeatmapFile from "./routes/calculate-beatmap-file";
import difficultyAttributes from "./routes/difficulty-attributes";
import getOnlineScoreAttributes from "./routes/get-online-score-attributes";
import performanceAttributes from "./routes/performance-attributes";
import { initiateReplayProcessing } from "./utils/dppUtil";

config();

DroidAPIRequestBuilder.setAPIKey(process.env.DROID_API_KEY!);
OsuAPIRequestBuilder.setAPIKey(process.env.OSU_API_KEY!);

const baseRouter = Router()
    .use("/calculate-beatmap-file", calculateBeatmapFile)
    .use("/difficulty-attributes", difficultyAttributes)
    .use("/performance-attributes", performanceAttributes)
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

DatabaseManager.init()
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
