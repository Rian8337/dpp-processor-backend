import { UnauthorizedError } from "@dpp/server";
import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";

const publicPaths = new Set(["/info"]);

/**
 * Requires the `X-Api-Key` header on every route except `/info`.
 */
export function createApiKeyMiddleware(apiKey: string): RequestHandler {
    const expected = Buffer.from(apiKey);

    return (req, res, next) => {
        if (publicPaths.has(req.path)) {
            next();

            return;
        }

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
