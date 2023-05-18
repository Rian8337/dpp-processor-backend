import express from "express";
import cors from "cors";
import formData from "express-form-data";
import { config } from "dotenv";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import forwardReplay from "./routes/forward-replay";

config();

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(formData.parse());
app.use(formData.format());
app.use(formData.stream());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/forward-replay", forwardReplay);

const port = parseInt(process.env.PORT || "3006");

DatabaseManager.init().then(() => {
    app.listen(port, () => console.log("Backend is up"));
});
