import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import type { InfoResponse } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController, Controller, Get } from "@dpp/server";

/**
 * Reports which variant this process runs. Public, so the broker can check its registry against it.
 */
@Controller("/info")
export class InfoController extends BaseController {
    constructor(
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
    ) {
        super();
    }

    @Get("")
    getInfo(_req: Request, res: Response<InfoResponse>): void {
        const { id, mode, algorithm, calculatorVersion, builtAt } =
            this.manifest;

        res.json({ id, mode, algorithm, calculatorVersion, builtAt });
    }
}
