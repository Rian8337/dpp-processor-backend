import type { ErrorResponse } from "@dpp/shared";
import type { RequestHandler } from "express";

const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Lets only loopback connections through. The game routes have no key (the game server never sent one), so they
 * stay internal even if `HOST` is widened.
 */
export const loopbackOnly: RequestHandler = (req, res, next) => {
    if (loopback.has(req.socket.remoteAddress ?? "")) {
        next();
        return;
    }

    res.status(403).json({
        error: {
            code: "UNAUTHORIZED",
            message: "This route only accepts local connections",
        },
    } satisfies ErrorResponse);
};
