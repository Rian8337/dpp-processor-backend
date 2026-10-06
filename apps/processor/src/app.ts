import express from "express";
import helmet from "helmet";
import { getContainer } from "./dependencies/container";
import { dependencyTokens } from "./dependencies/tokens";
import { createApiKeyMiddleware } from "./middleware/apiKey";
import { errorHandler, notFoundHandler } from "./middleware/errorHandlers";
import { createRouter } from "./router";

/**
 * Creates the Express application. The API key is checked before the body is parsed, so unauthenticated
 * requests cost nothing.
 */
export function createApp(container = getContainer()) {
    const config = container.resolve(dependencyTokens.config);

    return express()
        .disable("x-powered-by")
        .set("trust proxy", 1)
        .use(helmet())
        .use(createApiKeyMiddleware(config.apiKey))
        .use(express.json({ limit: "1mb" }))
        .use(createRouter(container))
        .use(notFoundHandler)
        .use(errorHandler);
}
