import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid maximum combo parameter.
 *
 * For GET requests, the combo is expected in the query parameters.
 * For POST requests, the combo is expected in the request body.
 *
 * The maximum combo is expected to be in the key `maxcombo`.
 *
 * @param required Whether the maximum combo is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the maximum combo.
 */
export function MaximumComboValidator(required = true): MethodDecorator {
    interface Param {
        maxcombo?: string | number;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let maxCombo: number | undefined;

            switch (method) {
                case HttpMethod.Get:
                    if (req.query.maxcombo !== undefined) {
                        maxCombo = parseInt(req.query.maxcombo as string);
                    }
                    break;

                case HttpMethod.Post:
                    if (req.body.maxcombo !== undefined) {
                        maxCombo = parseInt(req.body.maxcombo as string);
                    }
                    break;
            }

            if (required && maxCombo === undefined) {
                res.status(400).json({ error: "Maximum combo is required." });
                return;
            }

            if (maxCombo !== undefined && maxCombo < 0) {
                res.status(400).json({
                    error: "Maximum combo must be a non-negative integer.",
                });
                return;
            }

            switch (method) {
                case HttpMethod.Get:
                    req.query.maxcombo = maxCombo;
                    break;

                case HttpMethod.Post:
                    req.body.maxcombo = maxCombo;
                    break;
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
