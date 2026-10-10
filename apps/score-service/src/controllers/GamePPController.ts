import { dependencyTokens } from "@/dependencies/tokens";
import { runMiddleware } from "@/http/runMiddleware";
import type { IGamePPService } from "@/services/IGamePPService";
import { Controller, Post } from "@dpp/server";
import {
    calculateReplayFieldsSchema,
    calculateScoreFieldsSchema,
    type GamePPResponse,
} from "@dpp/shared";
import express, {
    type Request,
    type RequestHandler,
    type Response,
} from "express";
import multer from "multer";
import { inject } from "tsyringe";
import type { z } from "zod";

const maxReplayBytes = 2 * 1024 * 1024;
const json = express.json({ limit: "64kb" });
const urlencoded = express.urlencoded({ extended: false, limit: "64kb" });
const multipart = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxReplayBytes, files: 1, fields: 32 },
});
const nothing: GamePPResponse = { pp: null, pp_multiplier: null };

/**
 * Drop-in replacement for pp-processor-node's routes. Every failure, including unreadable bodies, answers
 * `200 { pp: null, pp_multiplier: null }` so the game records the score as uncalculated.
 */
@Controller("")
export class GamePPController {
    constructor(
        @inject(dependencyTokens.gamePPService)
        private readonly service: IGamePPService,
    ) {}

    @Post("/calculate-score")
    async calculateScore(
        req: Request,
        res: Response<GamePPResponse>,
    ): Promise<void> {
        try {
            await this.readBody(req, res, multipart.none());

            const fields = calculateScoreFieldsSchema.safeParse(req.body);

            if (!fields.success) {
                console.log(
                    `calculate-score rejected: ${describe(fields.error)}`,
                );
                res.json(nothing);
                return;
            }

            res.json(await this.service.calculateScore(fields.data));
        } catch (e) {
            console.log(
                `calculate-score failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            res.json(nothing);
        }
    }

    @Post("/calculate-replay")
    async calculateReplay(
        req: Request,
        res: Response<GamePPResponse>,
    ): Promise<void> {
        try {
            await this.readBody(req, res, multipart.single("replayfile"));

            const fields = calculateReplayFieldsSchema.safeParse(
                req.body ?? {},
            );

            if (!req.file || !fields.success) {
                console.log(
                    `calculate-replay rejected: ${req.file ? describe(fields.error!) : "no replayfile"}`,
                );
                res.json(nothing);
                return;
            }

            res.json(
                await this.service.calculateReplay(
                    req.file.buffer,
                    fields.data.variant,
                ),
            );
        } catch (e) {
            console.log(
                `calculate-replay failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            res.json(nothing);
        }
    }

    private async readBody(
        req: Request,
        res: Response,
        files: RequestHandler,
    ): Promise<void> {
        await runMiddleware(req, res, json);
        await runMiddleware(req, res, urlencoded);
        await runMiddleware(req, res, files);
    }
}

/**
 * The first issue's field and message, never its value.
 */
function describe(error: z.ZodError): string {
    const issue = error.issues[0];

    return issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "invalid body";
}
