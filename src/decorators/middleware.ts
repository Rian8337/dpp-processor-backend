import { RequestHandler } from "express";

/**
 * Attaches one or more middlewares to a controller or specific route.
 *
 * @param middlewares The middlewares to attach.
 * @returns A method decorator or class decorator.
 */
export function UseMiddleware(
    ...middlewares: RequestHandler[]
): MethodDecorator & ClassDecorator {
    return (target: object, propertyKey?: string | symbol) => {
        if (propertyKey) {
            // Route-level middleware
            const metadataKey = "route:middlewares";

            const existing =
                (Reflect.getMetadata(metadataKey, target, propertyKey) as
                    | RequestHandler[]
                    | undefined) ?? [];

            Reflect.defineMetadata(
                metadataKey,
                existing.concat(middlewares),
                target,
                propertyKey,
            );
        } else {
            // Controller-level middleware
            const metadataKey = "controller:middlewares";

            const existing =
                (Reflect.getMetadata(metadataKey, target) as
                    | RequestHandler[]
                    | undefined) ?? [];

            Reflect.defineMetadata(
                metadataKey,
                existing.concat(middlewares),
                target,
            );
        }
    };
}
