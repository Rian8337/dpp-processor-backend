import express from "express";
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

app.use("/calculate-beatmap-file", calculateBeatmapFile);
app.use("/get-difficulty-attributes", getDifficultyAttributes);
app.use("/get-performance-attributes", getPerformanceAttributes);
app.use("/get-player-best-score-performance", getPlayerBestScorePerformance);
app.use("/get-online-score-attributes", getOnlineScoreAttributes);
app.use("/forward-replay", forwardReplay);
app.use("/submit-scores", submitScores);

const port = parseInt(process.env.PORT || "3006");

DatabaseManager.init().then(() => {
    app.listen(port, () => console.log("DPP processor backend is up"));
});
