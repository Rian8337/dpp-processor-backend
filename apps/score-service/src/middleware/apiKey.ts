import { UnauthorizedError } from "@dpp/server";
import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * Requires `X-Api-Key` to equal `apiKey` (compared in constant time).
 */
export function createApiKeyMiddleware(apiKey: string): RequestHandler {
    const expected = Buffer.from(apiKey);

    return (req, res, next) => {
        const provided = Buffer.from(req.get("x-api-key") ?? "");

        if (
            provided.length !== expected.length ||
            !timingSafeEqual(provided, expected)
        ) {
            res.status(401).json(new UnauthorizedError().toResponse());

            return;
        }

        next();
    };
}
