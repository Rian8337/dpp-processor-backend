import { HttpMethod } from "@/types";
import { validateUserId } from "@/utils/validators";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid osu!droid account user ID.
 *
 * For GET requests, the user ID is expected in the query parameters.
 * For POST requests, the user ID is expected in the request body.
 *
 * The user ID is expected to be in the key `uid`.
 *
 * @param required Whether the user ID is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the user ID.
 */
export function UserIdValidator(required = true): MethodDecorator {
    interface Param {
        uid?: string | number;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let uid: number | undefined;

            switch (method) {
                case HttpMethod.Get:
                    if (req.query.uid !== undefined) {
                        uid = parseInt(req.query.uid as string);
                    }
                    break;

                case HttpMethod.Post:
                    if (req.body.uid !== undefined) {
                        uid = parseInt(req.body.uid as string);
                    }
                    break;
            }

            if (required && uid === undefined) {
                res.status(400).json({ error: "User ID is required." });
                return;
            }

            if (uid !== undefined) {
                try {
                    validateUserId(uid);
                } catch (e) {
                    res.status(400).json({ error: (e as Error).message });
                    return;
                }
            }

            switch (method) {
                case HttpMethod.Get:
                    req.query.uid = uid;
                    break;

                case HttpMethod.Post:
                    req.body.uid = uid;
                    break;
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
