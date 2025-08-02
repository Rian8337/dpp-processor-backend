import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid beatmap ID.
 *
 * For GET requests, the ID is expected in the query parameters.
 * For POST requests, the ID is expected in the request body.
 *
 * The ID is expected to be in the key `beatmapid`.
 *
 * @param required Whether the beatmap ID is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the beatmap ID.
 */
export function BeatmapIdValidator(required = true): MethodDecorator {
    interface Param {
        beatmapid?: string | number;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let id: number | undefined;

            const parseParam = (param: Param) => {
                if (param.beatmapid !== undefined) {
                    id = parseInt(param.beatmapid as string);
                }
            };

            switch (method) {
                case HttpMethod.Get:
                    parseParam(req.query);
                    break;

                case HttpMethod.Post:
                    parseParam(req.body);
                    break;
            }

            if (required && id === undefined) {
                res.status(400).json({ error: "Beatmap ID is required." });
                return;
            }

            if (id !== undefined) {
                if (!Number.isInteger(id)) {
                    res.status(400).json({
                        error: "Beatmap ID must be an integer.",
                    });
                    return;
                }

                if (id < 1) {
                    res.status(400).json({
                        error: "Beatmap ID must be a positive integer.",
                    });
                    return;
                }
            }

            switch (method) {
                case HttpMethod.Get:
                    req.query.beatmapid = id;
                    break;

                case HttpMethod.Post:
                    req.body.beatmapid = id;
                    break;
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
