import { dependencyTokens } from "@/dependencies/tokens";
import type { ICalculationService } from "@/services/ICalculationService";
import {
    performanceRequestSchema,
    replayPerformanceRequestSchema,
} from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController, Controller, parseBody, Post } from "@dpp/server";

@Controller("/performance")
export class PerformanceController extends BaseController {
    constructor(
        @inject(dependencyTokens.calculationService)
        private readonly calculations: ICalculationService,
    ) {
        super();
    }

    @Post("")
    async calculate(req: Request, res: Response): Promise<void> {
        try {
            res.json(
                await this.calculations.calculatePerformance(
                    parseBody(performanceRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Post("/replay")
    async calculateReplay(req: Request, res: Response): Promise<void> {
        try {
            res.json(
                await this.calculations.calculateReplayPerformance(
                    parseBody(replayPerformanceRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
