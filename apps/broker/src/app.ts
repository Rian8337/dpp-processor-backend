import {
    createRouter,
    errorHandler,
    getContainer,
    notFoundHandler,
} from "@dpp/server";
import { maxRequestBodyBytes } from "@dpp/shared";
import cors from "cors";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
// Load controllers so their metadata is registered before the router is built.
import "./controllers";
import { dependencyTokens } from "./dependencies/tokens";
import { createAuthMiddleware } from "./middleware/auth";
import { createRateLimitMiddleware } from "./middleware/rateLimit";
import { createUsageMiddleware } from "./middleware/usage";

/**
 * Creates the Express application. Callers are authenticated and rate-limited before the body is read, so rejected
 * requests cost almost nothing. CORS preflights are answered before either and are not counted.
 *
 * @param first Middleware to run before everything else, such as `GracefulServer.middleware`.
 */
export function createApp(
    container = getContainer(),
    first: RequestHandler = (_req, _res, next) => next(),
) {
    const config = container.resolve(dependencyTokens.config);
    const registry = container.resolve(dependencyTokens.registryService);
    const usage = container.resolve(dependencyTokens.usageStats);

    return (
        express()
            .disable("x-powered-by")
            .set("trust proxy", config.trustProxy)
            .use(first)
            // Responses are meant to be read by pages on other origins.
            .use(
                helmet({
                    crossOriginResourcePolicy: { policy: "cross-origin" },
                }),
            )
            .use(
                cors({
                    origin: "*",
                    allowedHeaders: [
                        "Content-Type",
                        "X-Api-Key",
                        "X-Acting-Uid",
                    ],
                    exposedHeaders: [
                        "X-Variant",
                        "RateLimit",
                        "RateLimit-Policy",
                        "Retry-After",
                    ],
                }),
            )
            .use(createUsageMiddleware(usage))
            .use(
                createAuthMiddleware(registry, {
                    // ANON_RATE_LIMIT=0 turns anonymous access off.
                    allowAnonymous: config.anonymousRateLimit > 0,
                }),
            )
            .use(
                createRateLimitMiddleware({
                    anonymousLimit: config.anonymousRateLimit,
                    usage,
                }),
            )
            .use(
                express.raw({
                    type: "application/json",
                    limit: maxRequestBodyBytes,
                }),
            )
            .use(createRouter(container))
            .use(notFoundHandler)
            .use(errorHandler)
    );
}
