import {
    createRouter,
    errorHandler,
    getContainer,
    notFoundHandler,
} from "@dpp/server";
import { maxRequestBodyBytes } from "@dpp/shared";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
// Load controllers so their metadata is registered before the router is built.
import "./controllers";
import { dependencyTokens } from "./dependencies/tokens";
import { createApiKeyMiddleware } from "./middleware/apiKey";

/**
 * Creates the Express application. The API key is checked before the body is parsed, so unauthenticated
 * requests cost nothing.
 *
 * @param first Middleware to run before everything else, such as `GracefulServer.middleware`.
 */
export function createApp(
    container = getContainer(),
    first: RequestHandler = (_req, _res, next) => next(),
) {
    const config = container.resolve(dependencyTokens.config);

    return express()
        .disable("x-powered-by")
        .set("trust proxy", 1)
        .use(first)
        .use(helmet())
        .use(createApiKeyMiddleware(config.apiKey))
        .use(express.json({ limit: maxRequestBodyBytes }))
        .use(createRouter(container))
        .use(notFoundHandler)
        .use(errorHandler);
}
