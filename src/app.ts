import cors from "cors";
import express from "express";
import formData from "express-form-data";

/**
 * Creates an Express application with all necessary configurations.
 */
export function createApp() {
    const app = express();

    app.use(formData.parse())
        .use(formData.format())
        .use(formData.union())
        .use(express.json())
        .use(express.urlencoded({ extended: true }))
        .use(cors());

    return app;
}
