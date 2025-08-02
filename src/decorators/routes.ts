import { HttpMethod, RouteDecorator, RouteDefinition } from "@/types";

function createRouteDecorator(method: HttpMethod): RouteDecorator {
    return (path = "/"): MethodDecorator => {
        return (target, propertyKey) => {
            const routes: RouteDefinition[] =
                (Reflect.getMetadata("routes", target.constructor) as
                    | RouteDefinition[]
                    | undefined) ?? [];

            routes.push({
                path,
                method,
                handlerName: propertyKey.toString(),
            });

            Reflect.defineMetadata("routes", routes, target.constructor);
        };
    };
}

/**
 * Marks a method as a route handler for a GET request.
 *
 * @returns A method decorator that registers the route.
 */
export const Get = createRouteDecorator(HttpMethod.Get);

/**
 * Marks a method as a route handler for a POST request.
 *
 * @returns A method decorator that registers the route.
 */
export const Post = createRouteDecorator(HttpMethod.Post);

/**
 * Marks a method as a route handler for a PUT request.
 *
 * @returns A method decorator that registers the route.
 */
export const Put = createRouteDecorator(HttpMethod.Put);

/**
 * Marks a method as a route handler for a DELETE request.
 *
 * @returns A method decorator that registers the route.
 */
export const Delete = createRouteDecorator(HttpMethod.Delete);
