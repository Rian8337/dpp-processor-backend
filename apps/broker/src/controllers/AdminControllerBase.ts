import type { IRegistryService } from "@/services/IRegistryService";
import { RegistryChangeError } from "@/registry/RegistryChangeError";
import { toApiError } from "@/types/errors";
import { APIError, BaseController } from "@dpp/server";
import type { ErrorResponse } from "@dpp/shared";
import type { Request, Response } from "express";

/**
 * The Postgres error code on the error or its `cause` chain, if any.
 */
function findErrorCode(error: unknown): string | undefined {
    for (
        let current = error;
        typeof current === "object" && current !== null;
        current = (current as { cause?: unknown }).cause
    ) {
        const { code } = current as { code?: unknown };

        if (typeof code === "string") {
            return code;
        }
    }

    return undefined;
}

/**
 * What the admin controllers share: registry errors become API errors, and a successful write is applied and logged.
 */
export abstract class AdminControllerBase extends BaseController {
    constructor(protected readonly registry: IRegistryService) {
        super();
    }

    /**
     * Sends the response for an error thrown by a handler. Unlike `BaseController.handleError`, an unexpected error is
     * logged as a summary only: a failed query's message carries its bound parameters, which here are descriptions or
     * key hashes.
     */
    protected fail(req: Request, res: Response, error: unknown): void {
        if (error instanceof RegistryChangeError) {
            this.handleError(res, toApiError(error));

            return;
        }

        if (error instanceof APIError) {
            this.handleError(res, error);

            return;
        }

        const name = error instanceof Error ? error.name : typeof error;
        const code = findErrorCode(error);

        console.error(
            `[Unhandled Error]: ${name}${code === undefined ? "" : ` (code ${code})`} during ${req.method} ${req.path}`,
        );

        res.status(500).json({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        } satisfies ErrorResponse);
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
