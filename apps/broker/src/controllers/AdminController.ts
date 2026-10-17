import { dependencyTokens } from "@/dependencies/tokens";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { IRegistryAdminService } from "@/services/IRegistryAdminService";
import type { IRegistryService } from "@/services/IRegistryService";
import { readJsonBody } from "@/http/jsonBody";
import { VariantNotFoundError } from "@/types/errors";
import { Controller, Delete, Get, Patch, parseBody, Put } from "@dpp/server";
import {
    aliasSetSchema,
    roleSetSchema,
    variantUpdateSchema,
    type AdminUser,
    type AdminVariant,
} from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { requireRole } from "./adminAccess";
import { AdminControllerBase } from "./AdminControllerBase";
import { toAdminUser, toAdminVariant } from "./adminViews";

/**
 * Variants, aliases, grants, and roles. Keys are in `AdminKeysController`.
 */
@Controller("/admin")
export class AdminController extends AdminControllerBase {
    constructor(
        @inject(dependencyTokens.registryService) registry: IRegistryService,
        @inject(dependencyTokens.registryAdminService)
        private readonly admin: IRegistryAdminService,
        @inject(dependencyTokens.healthMonitor)
        private readonly health: IHealthMonitor,
    ) {
        super(registry);
    }

    @Get("/variants")
    listVariants(_req: Request, res: Response<AdminVariant[]>): void {
        try {
            requireRole(this.registry, res, "manager");

            res.json(
                this.registry
                    .allVariants()
                    .map((variant) => toAdminVariant(variant, this.health)),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Patch("/variants/:name")
    async updateVariant(
        req: Request<{ name: string }>,
        res: Response<AdminVariant>,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");
            const changes = parseBody(variantUpdateSchema, readJsonBody(req));

            // Checked before anything is written, so a refused change applies none of its fields.
            if (changes.public !== undefined) {
                requireRole(this.registry, res, "admin");
            }

            const { name } = req.params;

            await this.admin.updateVariant(name, changes);
            await this.applied(req, uid);

            const variant = this.registry
                .allVariants()
                .find((candidate) => candidate.name === name);

            if (!variant) {
                throw new VariantNotFoundError(name);
            }

            res.json(toAdminVariant(variant, this.health));
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Put("/aliases/:alias")
    async setAlias(
        req: Request<{ alias: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");
            const { variant } = parseBody(aliasSetSchema, readJsonBody(req));

            await this.admin.setAlias(req.params.alias, variant);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Delete("/aliases/:alias")
    async removeAlias(
        req: Request<{ alias: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");

            await this.admin.removeAlias(req.params.alias);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Get("/variants/:name/grants")
    async listGrants(
        req: Request<{ name: string }>,
        res: Response<number[]>,
    ): Promise<void> {
        try {
            requireRole(this.registry, res, "manager");

            res.json(await this.admin.usersGranted(req.params.name));
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Put("/variants/:name/grants/:uid")
    async grantUser(
        req: Request<{ name: string; uid: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");

            // The service rejects a uid that is not valid.
            await this.admin.grantUser(Number(req.params.uid), req.params.name);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Delete("/variants/:name/grants/:uid")
    async ungrantUser(
        req: Request<{ name: string; uid: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");

            await this.admin.ungrantUser(
                Number(req.params.uid),
                req.params.name,
            );
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Get("/users")
    async listUsers(_req: Request, res: Response<AdminUser[]>): Promise<void> {
        try {
            requireRole(this.registry, res, "admin");

            res.json((await this.admin.listUsers()).map(toAdminUser));
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Put("/users/:uid/role")
    async setRole(
        req: Request<{ uid: string }>,
        res: Response<AdminUser>,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "admin");
            const { role } = parseBody(roleSetSchema, readJsonBody(req));
            const target = Number(req.params.uid);

            await this.admin.setRole(target, role, uid);
            await this.applied(req, uid);

            const user = this.registry.findUser(target);

            res.json(
                toAdminUser({
                    uid: target,
                    role: user?.role ?? null,
                    grants: [...(user?.grants ?? [])].sort(),
                }),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
