import { findCaller, findVariantName } from "@/http/requestContext";
import { callerName } from "@/registry/snapshot";
import type { IUsageStats } from "@/services/IUsageStats";
import type { RequestHandler } from "express";

/**
 * Records every finished request in the usage statistics, and logs each 5xx response on its own line.
 */
export function createUsageMiddleware(
    usage: Pick<IUsageStats, "record">,
): RequestHandler {
    return (req, res, next) => {
        const started = performance.now();
        // Captured now: routers may rewrite req.url while handling the request.
        const { method, path } = req;

        res.once("finish", () => {
            const caller = findCaller(res);
            const variant = findVariantName(res) ?? null;
            const name = caller ? callerName(caller) : "unauthenticated";

            usage.record({
                variant,
                caller: name,
                status: res.statusCode,
                durationMs: performance.now() - started,
            });

            if (res.statusCode >= 500) {
                console.error(
                    `${method} ${path} answered ${res.statusCode.toString()} (variant ${variant ?? "-"}, caller ${name})`,
                );
            }
        });

        next();
    };
}
