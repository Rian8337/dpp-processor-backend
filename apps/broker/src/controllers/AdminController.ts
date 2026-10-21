import { dependencyTokens } from "@/dependencies/tokens";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { IRegistryAdminService } from "@/services/IRegistryAdminService";
import type { IRegistryService } from "@/services/IRegistryService";
import { readJsonBody } from "@/http/jsonBody";
import { RegistryChangeError } from "@/registry/RegistryChangeError";
import { VariantNotFoundError } from "@/types/errors";
import { Controller, Delete, Get, Patch, parseBody, Put } from "@dpp/server";
import {
    aliasSetSchema,
    parseActingUid,
    roleSetSchema,
    variantUpdateSchema,
    type AdminUser,
    type AdminVariant,
} from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import {
    canManageVariant,
    requireGrantChangeAllowed,
    requireRole,
    requireVariantManager,
} from "./adminAccess";
import { AdminControllerBase } from "./AdminControllerBase";
import { toAdminUser, toAdminVariant } from "./adminViews";

/**
 * Reads a uid from a path. Like the `X-Acting-Uid` header, it is a plain positive integer: `Number` would also accept
 * `1e3`, `0x10`, and a padded ` 7`.
 *
 * @throws {RegistryChangeError} `invalid` if it is not a uid.
 */
function pathUid(raw: string): number {
    const uid = parseActingUid(raw);

    if (uid === undefined || uid === "invalid") {
        throw new RegistryChangeError("invalid", `Invalid uid "${raw}"`);
    }

    return uid;
}

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

    /**
     * Requires that the acting person may manage the variant the alias points to now. A new alias points nowhere, so
     * it passes.
     *
     * @throws {ForbiddenError} If the person may not manage the variant the alias points to.
     */
    private requireAliasTargetManager(res: Response, alias: string): void {
        const current = this.registry
            .allVariants()
            .find((variant) => variant.aliases.includes(alias));

        if (current) {
            requireVariantManager(this.registry, res, current.name);
        }
    }

    @Get("/variants")
    listVariants(req: Request, res: Response<AdminVariant[]>): void {
        try {
            const { uid, role } = requireRole(this.registry, res, "manager");
            const user = this.registry.findUser(uid);

            res.json(
                this.registry
                    .allVariants()
                    .filter(
                        (variant) =>
                            role === "admin" ||
                            canManageVariant(user, variant.name),
                    )
                    .map((variant) => toAdminVariant(variant, this.health)),
            );
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Patch("/variants/:name")
    async updateVariant(
        req: Request<{ name: string }>,
        res: Response<AdminVariant>,
    ): Promise<void> {
        try {
            const { name } = req.params;
            const { uid } = requireVariantManager(this.registry, res, name);
            const changes = parseBody(variantUpdateSchema, readJsonBody(req));

            // Checked before anything is written, so a refused change applies none of its fields.
            if (changes.public !== undefined || changes.pinned !== undefined) {
                requireRole(this.registry, res, "admin");
            }

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
            this.fail(req, res, e);
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

            // Both ends are checked before anything is written: the variant the alias will point to, and the one it
            // points to now (none for a new alias).
            requireVariantManager(this.registry, res, variant);
            this.requireAliasTargetManager(res, req.params.alias);

            await this.admin.setAlias(req.params.alias, variant);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Delete("/aliases/:alias")
    async removeAlias(
        req: Request<{ alias: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "manager");

            this.requireAliasTargetManager(res, req.params.alias);

            await this.admin.removeAlias(req.params.alias);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Get("/variants/:name/grants")
    async listGrants(
        req: Request<{ name: string }>,
        res: Response<number[]>,
    ): Promise<void> {
        try {
            requireVariantManager(this.registry, res, req.params.name);

            res.json(await this.admin.usersGranted(req.params.name));
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Put("/variants/:name/grants/:uid")
    async grantUser(
        req: Request<{ name: string; uid: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const actor = requireVariantManager(
                this.registry,
                res,
                req.params.name,
            );
            const target = pathUid(req.params.uid);

            requireGrantChangeAllowed(this.registry, actor, target);

            await this.admin.grantUser(target, req.params.name);
            await this.applied(req, actor.uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Delete("/variants/:name/grants/:uid")
    async ungrantUser(
        req: Request<{ name: string; uid: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const actor = requireVariantManager(
                this.registry,
                res,
                req.params.name,
            );
            const target = pathUid(req.params.uid);

            requireGrantChangeAllowed(this.registry, actor, target);

            await this.admin.ungrantUser(target, req.params.name);
            await this.applied(req, actor.uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Get("/users")
    async listUsers(req: Request, res: Response<AdminUser[]>): Promise<void> {
        try {
            requireRole(this.registry, res, "admin");

            res.json((await this.admin.listUsers()).map(toAdminUser));
        } catch (e) {
            this.fail(req, res, e);
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
            const target = pathUid(req.params.uid);

            await this.admin.setRole(target, role, uid);
            await this.applied(req, uid, `role ${role ?? "none"}`);

            const user = this.registry.findUser(target);

            res.json(
                toAdminUser({
                    uid: target,
                    role: user?.role ?? null,
                    grants: [...(user?.grants ?? [])].sort(),
                }),
            );
        } catch (e) {
            this.fail(req, res, e);
        }
    }
}
