import type { IRegistryService } from "@/services/IRegistryService";
import { RegistryChangeError } from "@/registry/RegistryChangeError";
import { toApiError } from "@/types/errors";
import { BaseController } from "@dpp/server";
import type { Request, Response } from "express";

/**
 * What the admin controllers share: registry errors become API errors, and a successful write is applied and logged.
 */
export abstract class AdminControllerBase extends BaseController {
    constructor(protected readonly registry: IRegistryService) {
        super();
    }

    protected override handleError(res: Response, error: unknown): void {
        super.handleError(
            res,
            error instanceof RegistryChangeError ? toApiError(error) : error,
        );
    }

    /**
     * Applies a successful write at once by reloading the registry snapshot, then logs it. The log line never
     * includes the request body.
     *
     * @param uid The person who made the change.
     */
    protected async applied(req: Request, uid: number): Promise<void> {
        await this.registry.reload();

        console.log(
            `Admin change by uid ${uid.toString()}: ${req.method} ${req.path}`,
        );
    }
}
