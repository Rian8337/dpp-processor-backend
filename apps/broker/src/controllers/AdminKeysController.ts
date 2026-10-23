import { dependencyTokens } from "@/dependencies/tokens";
import { readJsonBody } from "@/http/jsonBody";
import type { IRegistryAdminService } from "@/services/IRegistryAdminService";
import type { IRegistryService } from "@/services/IRegistryService";
import {
    Controller,
    Delete,
    Get,
    parseBody,
    Patch,
    Post,
    Put,
} from "@dpp/server";
import {
    keyCreateSchema,
    keyUpdateSchema,
    type AdminKey,
    type CreatedKeyResponse,
} from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { callerKeyName, requireRole } from "./adminAccess";
import { AdminControllerBase } from "./AdminControllerBase";
import { toAdminKey } from "./adminViews";

/**
 * API keys; all of it needs the owner role, because a key that can act for users can act for anyone, owners included.
 */
@Controller("/admin/keys")
export class AdminKeysController extends AdminControllerBase {
    constructor(
        @inject(dependencyTokens.registryService) registry: IRegistryService,
        @inject(dependencyTokens.registryAdminService)
        private readonly admin: IRegistryAdminService,
    ) {
        super(registry);
    }

    @Get("")
    async list(req: Request, res: Response<AdminKey[]>): Promise<void> {
        try {
            requireRole(this.registry, res, "owner");

            res.json((await this.admin.listKeys()).map(toAdminKey));
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Post("")
    async create(
        req: Request,
        res: Response<CreatedKeyResponse>,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "owner");
            const input = parseBody(keyCreateSchema, readJsonBody(req));
            const { key, rawKey } = await this.admin.createKey(input);

            await this.applied(req, uid, `key ${key.name}`);

            // The raw key is shown once; it must not be kept by caches.
            res.status(201)
                .setHeader("Cache-Control", "no-store")
                .json({ key: toAdminKey(key), rawKey });
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Patch("/:name")
    async update(
        req: Request<{ name: string }>,
        res: Response<AdminKey>,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "owner");
            const changes = parseBody(keyUpdateSchema, readJsonBody(req));
            const key = await this.admin.updateKey(
                req.params.name,
                changes,
                callerKeyName(res),
            );

            await this.applied(req, uid);

            res.json(toAdminKey(key));
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Put("/:name/grants/:variant")
    async grant(
        req: Request<{ name: string; variant: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "owner");

            await this.admin.grantKey(req.params.name, req.params.variant);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Delete("/:name/grants/:variant")
    async ungrant(
        req: Request<{ name: string; variant: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "owner");

            await this.admin.ungrantKey(req.params.name, req.params.variant);
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }

    @Post("/:name/revoke")
    async revoke(req: Request<{ name: string }>, res: Response): Promise<void> {
        try {
            const { uid } = requireRole(this.registry, res, "owner");

            await this.admin.revokeKey(req.params.name, callerKeyName(res));
            await this.applied(req, uid);

            res.status(204).end();
        } catch (e) {
            this.fail(req, res, e);
        }
    }
}
