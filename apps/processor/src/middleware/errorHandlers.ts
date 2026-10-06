import type { ErrorResponse } from "@dpp/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";

function isBodyParserError(
    error: unknown,
): error is { status: number; type: string } {
    return (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        "status" in error &&
        typeof error.status === "number"
    );
}

const bodyParserMessages: Record<string, string> = {
    "entity.too.large": "Request body is too large",
    "entity.parse.failed": "Request body is not valid JSON",
    "charset.unsupported": "Unsupported request body charset",
    "encoding.unsupported": "Unsupported request body encoding",
    "request.aborted": "Request was aborted before its body was read",
    "request.size.invalid": "Request body size does not match its length",
};

/**
 * Responds to unknown routes with the JSON error shape.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json({
        error: { code: "INVALID_REQUEST", message: "Route not found" },
    } satisfies ErrorResponse);
};

/**
 * Responds to body parsing errors and anything unhandled with the JSON error shape.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (isBodyParserError(error)) {
        const message =
            bodyParserMessages[error.type] ?? "Request body could not be read";

        res.status(error.status).json({
            error: { code: "INVALID_REQUEST", message },
        } satisfies ErrorResponse);

        return;
    }

    console.error("[Unhandled Error]:", error);

    res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    } satisfies ErrorResponse);
};
