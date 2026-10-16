import { dependencyTokens } from "@/dependencies/tokens";
import { getCaller } from "@/http/requestContext";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { IRegistryService } from "@/services/IRegistryService";
import { VariantNotFoundError } from "@/types/errors";
import { BaseController, Controller, Get } from "@dpp/server";
import type { VariantSummary } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { toVariantSummary } from "./variantSummary";

@Controller("/variants")
export class VariantsController extends BaseController {
    constructor(
        @inject(dependencyTokens.registryService)
        private readonly registry: IRegistryService,
        @inject(dependencyTokens.healthMonitor)
        private readonly health: IHealthMonitor,
    ) {
        super();
    }

    @Get("")
    list(_req: Request, res: Response<VariantSummary[]>): void {
        res.json(
            this.registry
                .visibleVariants(getCaller(res))
                .map((variant) => toVariantSummary(variant, this.health)),
        );
    }

    @Get("/:name")
    get(req: Request<{ name: string }>, res: Response): void {
        try {
            const { name } = req.params;
            const variant = this.registry.resolve(name, getCaller(res));

            if (!variant) {
                throw new VariantNotFoundError(name);
            }

            res.json(toVariantSummary(variant, this.health));
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
