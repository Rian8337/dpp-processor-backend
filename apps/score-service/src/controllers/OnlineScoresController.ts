import { dependencyTokens } from "@/dependencies/tokens";
import type { IOnlineScoreService } from "@/services/IOnlineScoreService";
import { BaseController, Controller, Get, parseBody } from "@dpp/server";
import { onlineScoreQuerySchema, type OnlineScoreResponse } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";

@Controller("/online-scores")
export class OnlineScoresController extends BaseController {
    constructor(
        @inject(dependencyTokens.onlineScoreService)
        private readonly service: IOnlineScoreService,
    ) {
        super();
    }

    @Get("")
    async lookup(
        req: Request,
        res: Response<OnlineScoreResponse>,
    ): Promise<void> {
        try {
            res.json(
                await this.service.lookup(
                    parseBody(onlineScoreQuerySchema, req.query),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
