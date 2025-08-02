import { HttpMethod } from "./http";

/**
 * Represents a route definition in the application.
 */
export interface RouteDefinition {
    /**
     * The path of the route.
     */
    readonly path: string;

    /**
     * The HTTP method for the route.
     */
    readonly method: HttpMethod;

    /**
     * The name of the handler method.
     */
    readonly handlerName: string;
}

/**
 * A decorator for defining a route.
 *
 * @param path The path of the route. Defaults to root path (`/`).
 */
export type RouteDecorator = (path?: string) => MethodDecorator;
