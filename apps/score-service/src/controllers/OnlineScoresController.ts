import { dependencyTokens } from "@/dependencies/tokens";
import type { IOnlineScoreService } from "@/services/IOnlineScoreService";
import {
    BadRequestError,
    BaseController,
    Controller,
    Get,
    parseBody,
} from "@dpp/server";
import {
    onlineScoreQuerySchema,
    parseActingUid,
    type OnlineScoreResponse,
} from "@dpp/shared";
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
            const query = parseBody(onlineScoreQuerySchema, req.query);
            const actingUid = parseActingUid(req.get("x-acting-uid"));

            if (actingUid === "invalid") {
                throw new BadRequestError(
                    "X-Acting-Uid must be a positive integer",
                );
            }

            res.json(await this.service.lookup(query, actingUid));
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
