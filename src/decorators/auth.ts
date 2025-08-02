import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "./middleware";

/**
 * Marks a method as requiring authentication via an internal key.
 *
 * For GET requests, the key is expected in the query parameters.
 * For POST requests, the key is expected in the request body.
 *
 * The key is expected to be in the key `key`.
 *
 * @returns A method decorator that applies the authentication middleware.
 */
export function Authenticated(): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Partial<{ key: string }>,
            Partial<{ key: string }>
        > = (req, res, next) => {
            let key: string | undefined;

            switch (req.method.toLowerCase() as HttpMethod) {
                case HttpMethod.Get:
                    key = req.query.key;
                    break;

                case HttpMethod.Post:
                    key = req.body.key;
                    break;
            }

            if (key !== process.env.DROID_SERVER_INTERNAL_KEY) {
                res.status(401).json({ error: "Invalid internal key." });

                return;
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
