import {
    DroidAPIRequestBuilder,
    OsuAPIRequestBuilder,
} from "@rian8337/osu-base";
import { config } from "dotenv";
import "reflect-metadata";

config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env" });

DroidAPIRequestBuilder.setAPIKey(process.env.DROID_API_KEY!);
OsuAPIRequestBuilder.setAPIKey(process.env.OSU_API_KEY!);
