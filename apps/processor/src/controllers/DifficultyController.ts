import { dependencyTokens } from "@/dependencies/tokens";
import type { ICalculationService } from "@/services/ICalculationService";
import { difficultyRequestSchema } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController, Controller, parseBody, Post } from "@dpp/server";

@Controller("/difficulty")
export class DifficultyController extends BaseController {
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
                await this.calculations.calculateDifficulty(
                    parseBody(difficultyRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
