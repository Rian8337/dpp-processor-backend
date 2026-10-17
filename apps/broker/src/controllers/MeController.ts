import { dependencyTokens } from "@/dependencies/tokens";
import type { IRegistryService } from "@/services/IRegistryService";
import { BaseController, Controller, Get } from "@dpp/server";
import type { MeResponse } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { requireActingUid } from "./adminAccess";

@Controller("/me")
export class MeController extends BaseController {
    constructor(
        @inject(dependencyTokens.registryService)
        private readonly registry: IRegistryService,
    ) {
        super();
    }

    /**
     * Who the request acts for. Needs no role, only an acting uid.
     */
    @Get("")
    get(_req: Request, res: Response<MeResponse>): void {
        try {
            const uid = requireActingUid(res);
            const user = this.registry.findUser(uid);

            res.json({
                uid,
                role: user?.role ?? null,
                grants: [...(user?.grants ?? [])].sort(),
            });
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
