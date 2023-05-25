import express, { Router } from "express";
import cors from "cors";
import formData from "express-form-data";
import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import calculateBeatmapFile from "./routes/calculate-beatmap-file";
import getDifficultyAttributes from "./routes/get-difficulty-attributes";
import getPerformanceAttributes from "./routes/get-performance-attributes";
import getPlayerBestScorePerformance from "./routes/get-player-best-score-performance";
import getOnlineScoreAttributes from "./routes/get-online-score-attributes";
import forwardReplay from "./routes/forward-replay";
import submitScores from "./routes/submit-scores";

config();

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(formData.parse());
app.use(formData.format());
app.use(formData.stream());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const baseRouter = Router();

baseRouter.use("/calculate-beatmap-file", calculateBeatmapFile);
baseRouter.use("/get-difficulty-attributes", getDifficultyAttributes);
baseRouter.use("/get-performance-attributes", getPerformanceAttributes);
baseRouter.use(
    "/get-player-best-score-performance",
    getPlayerBestScorePerformance
);
baseRouter.use("/get-online-score-attributes", getOnlineScoreAttributes);
baseRouter.use("/forward-replay", forwardReplay);
baseRouter.use("/submit-scores", submitScores);

app.use("/api/dpp/processor", baseRouter);

const port = parseInt(process.env.PORT || "3006");

DatabaseManager.init().then(() => {
    app.listen(port, () => console.log("DPP processor backend is up"));
});
