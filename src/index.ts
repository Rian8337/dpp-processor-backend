import express from "express";
import cors from "cors";
import formData from "express-form-data";
import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import getDifficultyAttributes from "./routes/get-difficulty-attributes";
import forwardReplay from "./routes/forward-replay";
import submitScore from "./routes/submit-score";

config();

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(formData.parse());
app.use(formData.format());
app.use(formData.stream());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/get-difficulty-attributes", getDifficultyAttributes);
app.use("/forward-replay", forwardReplay);
app.use("/submit-score", submitScore);

const port = parseInt(process.env.PORT || "3006");

DatabaseManager.init().then(() => {
    app.listen(port, () => console.log("DPP processor backend is up"));
});
