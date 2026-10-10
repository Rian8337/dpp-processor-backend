import {
    createRouter,
    errorHandler,
    getContainer,
    notFoundHandler,
} from "@dpp/server";
import express, { type RequestHandler } from "express";
// Load controllers so their metadata is registered before the router is built.
import "./controllers";
import { dependencyTokens } from "./dependencies/tokens";
import { createApiKeyMiddleware } from "./middleware/apiKey";

/**
 * Creates the Express application.
 *
 * @param first Middleware to run before everything else, such as `GracefulServer.middleware`.
 */
export function createApp(
    container = getContainer(),
    ...first: RequestHandler[]
) {
    const config = container.resolve(dependencyTokens.config);
    const app = express().disable("x-powered-by");

    // Express rejects `.use()` without handlers.
    if (first.length > 0) {
        app.use(...first);
    }

    return app
        .use("/online-scores", createApiKeyMiddleware(config.apiKey))
        .use(createRouter(container))
        .use(notFoundHandler)
        .use(errorHandler);
}
