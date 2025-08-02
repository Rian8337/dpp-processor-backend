import { HttpMethod } from "@/types";
import { validateMD5Hash } from "@/utils/validators";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid beatmap MD5 hash.
 *
 * For GET requests, the hash is expected in the query parameters.
 * For POST requests, the hash is expected in the request body.
 *
 * The hash is expected to be in the key `beatmaphash`.
 *
 * @param required Whether the beatmap hash is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the MD5 hash.
 */
export function BeatmapHashValidator(required = true): MethodDecorator {
    interface Param {
        beatmaphash?: string;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            let hash: string | undefined;

            switch (req.method.toLowerCase() as HttpMethod) {
                case HttpMethod.Get:
                    hash = req.query.beatmaphash;
                    break;

                case HttpMethod.Post:
                    hash = req.body.beatmaphash;
                    break;
            }

            if (required && !hash) {
                res.status(400).json({
                    error: "Beatmap MD5 hash is required.",
                });
                return;
            }

            if (hash) {
                try {
                    validateMD5Hash(hash);
                } catch (e) {
                    res.status(400).json({ error: (e as Error).message });
                    return;
                }
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
