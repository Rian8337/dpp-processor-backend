import { dependencyTokens } from "@/dependencies/tokens";
import { runMiddleware } from "@/http/runMiddleware";
import type { GamePPResult, IGamePPService } from "@/services/IGamePPService";
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
 * Drop-in replacement for pp-processor-node's routes, shaped by how the game (`submit.php`) reads them: it records a
 * score as uncalculated only when the request fails at the transport level.
 *
 * - Permanent failures (unreadable bodies, invalid fields, unsupported replays, definite answers from upstream)
 *   answer `200 { pp: null, pp_multiplier: null }`; the game stores the score without pp.
 * - Temporary failures (upstream busy or unreachable) and unexpected errors close the connection without a response,
 *   so the game records the score as uncalculated and the uncalculated pass calculates it later.
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
        if (
            !(await this.readBody(
                req,
                res,
                "calculate-score",
                multipart.none(),
            ))
        ) {
            return;
        }

        try {
            const fields = calculateScoreFieldsSchema.safeParse(req.body);

            if (!fields.success) {
                console.log(
                    `calculate-score rejected: ${describe(fields.error)}`,
                );
                res.json(nothing);
                return;
            }

            respond(
                req,
                res,
                "calculate-score",
                await this.service.calculateScore(fields.data),
            );
        } catch (e) {
            fail(req, "calculate-score", e);
        }
    }

    @Post("/calculate-replay")
    async calculateReplay(
        req: Request,
        res: Response<GamePPResponse>,
    ): Promise<void> {
        if (
            !(await this.readBody(
                req,
                res,
                "calculate-replay",
                multipart.single("replayfile"),
            ))
        ) {
            return;
        }

        try {
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

            respond(
                req,
                res,
                "calculate-replay",
                await this.service.calculateReplay(
                    req.file.buffer,
                    fields.data.variant,
                ),
            );
        } catch (e) {
            fail(req, "calculate-replay", e);
        }
    }

    /**
     * Whether the body could be read. An unreadable body (malformed, too large, unexpected file) is the caller's
     * fault and permanent, so it is answered with nulls here.
     */
    private async readBody(
        req: Request,
        res: Response<GamePPResponse>,
        route: string,
        files: RequestHandler,
    ): Promise<boolean> {
        try {
            await runMiddleware(req, res, json);
            await runMiddleware(req, res, urlencoded);
            await runMiddleware(req, res, files);

            return true;
        } catch (e) {
            console.log(
                `${route} failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            res.json(nothing);

            return false;
        }
    }
}

function respond(
    req: Request,
    res: Response<GamePPResponse>,
    route: string,
    result: GamePPResult,
): void {
    switch (result.kind) {
        case "ok":
            res.json(result.response);
            return;
        case "failed":
            res.json(nothing);
            return;
        case "retry":
            closeConnection(req, route, "temporary failure");
    }
}

function fail(req: Request, route: string, e: unknown): void {
    closeConnection(
        req,
        route,
        `unexpected error: ${e instanceof Error ? e.message : String(e)}`,
    );
}

function closeConnection(req: Request, route: string, reason: string): void {
    console.log(
        `${route} failed (${reason}); closing the connection so the game records the score as uncalculated`,
    );
    req.socket.destroy();
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
