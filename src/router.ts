import { RequestHandler, Router } from "express";
// Ensure controllers are loaded and metadata is registered
import { constructor } from "tsyringe/dist/typings/types";
import "./controllers";
import { getContainer } from "./dependencies/container";
import { RouteDefinition } from "./types";

/**
 * Creates the router for the application.
 */
export function createRouter(): Router {
    const container = getContainer();
    const router = Router();

    const controllers =
        (Reflect.getMetadata("controllers", globalThis) as
            | constructor<Record<string, RequestHandler>>[]
            | undefined) ?? [];

    for (const cls of controllers) {
        const basePath = Reflect.getMetadata("basePath", cls) as
            | string
            | undefined;

        if (!basePath) {
            throw new Error(
                `Controller ${cls.name} does not have a base path defined. It may not have been decorated with @Controller.`,
            );
        }

        const routes =
            (Reflect.getMetadata("routes", cls) as
                | RouteDefinition[]
                | undefined) ?? [];

        if (routes.length === 0) {
            // Skip controllers without routes.
            continue;
        }

        const controllerMiddlewares =
            (Reflect.getMetadata("controller:middlewares", cls) as
                | RequestHandler[]
                | undefined) ?? [];

        if (!container.isRegistered(cls)) {
            container.registerSingleton(cls);
        }

        const instance = container.resolve(cls);

        for (const route of routes) {
            const routeMiddlewares =
                (Reflect.getMetadata(
                    "route:middlewares",
                    cls.prototype as object,
                    route.handlerName,
                ) as RequestHandler[] | undefined) ?? [];

            const fullPath = `${basePath}${route.path}`;

            router[route.method](
                fullPath,
                ...controllerMiddlewares,
                ...routeMiddlewares,
                instance[route.handlerName].bind(instance),
            );
        }
    }

    return router;
}
