import { dependencyTokens } from "@/dependencies/tokens";
import { getCaller, setVariantName } from "@/http/requestContext";
import type { IProxyService } from "@/services/IProxyService";
import type { IRegistryService } from "@/services/IRegistryService";
import { RouteNotFoundError, VariantNotFoundError } from "@/types/errors";
import { BadRequestError, BaseController, Controller, Post } from "@dpp/server";
import { isProcessorRoute } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";

@Controller("/variants")
export class ProxyController extends BaseController {
    constructor(
        @inject(dependencyTokens.registryService)
        private readonly registry: IRegistryService,
        @inject(dependencyTokens.proxyService)
        private readonly proxy: IProxyService,
    ) {
        super();
    }

    /**
     * Forwards `POST /variants/:name/<processor route>` to a processor of the variant. The body was buffered (not
     * parsed) by `express.raw`; the processor validates it.
     */
    @Post("/:name/*route")
    async forward(
        req: Request<{ name: string; route: string[] }>,
        res: Response,
    ): Promise<void> {
        try {
            const { name, route: segments } = req.params;
            const route = `/${segments.join("/")}`;

            if (!isProcessorRoute(route)) {
                throw new RouteNotFoundError();
            }

            const variant = this.registry.resolve(name, getCaller(res));

            if (!variant) {
                throw new VariantNotFoundError(name);
            }

            setVariantName(res, variant.name);
            res.setHeader("X-Variant", variant.name);

            if (!Buffer.isBuffer(req.body)) {
                throw new BadRequestError(
                    "Request body must be JSON, sent with Content-Type: application/json",
                );
            }

            const response = await this.proxy.forward(variant, route, req.body);

            res.status(response.status)
                .type("application/json")
                .send(response.body);
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
