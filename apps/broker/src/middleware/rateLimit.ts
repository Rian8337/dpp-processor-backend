import { getCaller } from "@/http/requestContext";
import { callerName } from "@/registry/snapshot";
import type { Caller } from "@/registry/types";
import type { IUsageStats } from "@/services/IUsageStats";
import { RateLimitedError } from "@/types/errors";
import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

/**
 * Per-minute rate limits: each key by its own limit (none if unlimited), anonymous callers by IP. Counters live in
 * memory, which is correct for a single broker process.
 */
export function createRateLimitMiddleware(options: {
    anonymousLimit: number;
    usage: Pick<IUsageStats, "recordRateLimited">;
}): RequestHandler {
    const limitOf = (caller: Caller): number | null =>
        caller.kind === "key"
            ? caller.key.rateLimitPerMinute
            : options.anonymousLimit;

    return rateLimit({
        windowMs: 60_000,
        // Unlimited callers are skipped before this runs; the fallback only satisfies the type.
        limit: (_req, res) =>
            limitOf(getCaller(res)) ?? Number.MAX_SAFE_INTEGER,
        skip: (_req, res) => limitOf(getCaller(res)) === null,
        keyGenerator: (req, res) => {
            const caller = getCaller(res);

            return caller.kind === "key"
                ? `key:${caller.key.id.toString()}`
                : `ip:${ipKeyGenerator(req.ip ?? "")}`;
        },
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, res) => {
            const caller = getCaller(res);

            options.usage.recordRateLimited(callerName(caller));

            if (caller.kind === "key") {
                console.warn(`Rate limit reached by key ${caller.key.name}`);
            }

            res.status(429).json(new RateLimitedError().toResponse());
        },
    });
}
