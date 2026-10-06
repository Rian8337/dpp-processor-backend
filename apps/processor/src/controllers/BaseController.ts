import { APIError } from "@/types/errors";
import type { ErrorResponse } from "@dpp/shared";
import type { Response } from "express";

/**
 * Base class for controllers.
 */
export abstract class BaseController {
    /**
     * Sends the response for an error thrown by a handler. Unexpected errors are logged and reported as
     * `INTERNAL_ERROR` without details.
     */
    protected handleError(res: Response, error: unknown): void {
        if (error instanceof APIError) {
            res.status(error.statusCode).json(error.toResponse());

            return;
        }

        console.error("[Unhandled Error]:", error);

        res.status(500).json({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        } satisfies ErrorResponse);
    }
}
