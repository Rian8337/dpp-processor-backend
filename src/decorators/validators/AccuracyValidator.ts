import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having potentially valid accuracy parameters.
 *
 * For GET requests, the accuracy is expected in the query parameters.
 * For POST requests, the accuracy is expected in the request body.
 *
 * The accuracy parameters expected to be in the keys `n300`, `n100`, `n50`, and `nmiss`.
 *
 * @param required Whether the accuracy parameters are required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the accuracy parameters.
 */
export function AccuracyValidator(required = true): MethodDecorator {
    type Param = Partial<{
        n300: string | number;
        n100: string | number;
        n50: string | number;
        nmiss: string | number;
    }>;

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let n300: number | undefined;
            let n100: number | undefined;
            let n50: number | undefined;
            let nmiss: number | undefined;

            const parseParam = (param: Param) => {
                if (param.n300 !== undefined) {
                    n300 = parseInt(param.n300 as string);
                }

                if (param.n100 !== undefined) {
                    n100 = parseInt(param.n100 as string);
                }

                if (param.n50 !== undefined) {
                    n50 = parseInt(param.n50 as string);
                }

                if (param.nmiss !== undefined) {
                    nmiss = parseInt(param.nmiss as string);
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

            if (
                required &&
                (n300 === undefined ||
                    n100 === undefined ||
                    n50 === undefined ||
                    nmiss === undefined)
            ) {
                res.status(400).json({
                    error: "All accuracy parameters are required.",
                });
                return;
            }

            if (n300 !== undefined && n300 < 0) {
                res.status(400).json({
                    error: "n300 must be a non-negative integer.",
                });
                return;
            }

            if (n100 !== undefined && n100 < 0) {
                res.status(400).json({
                    error: "n100 must be a non-negative integer.",
                });
                return;
            }

            if (n50 !== undefined && n50 < 0) {
                res.status(400).json({
                    error: "n50 must be a non-negative integer.",
                });
                return;
            }

            if (nmiss !== undefined && nmiss < 0) {
                res.status(400).json({
                    error: "nmiss must be a non-negative integer.",
                });
                return;
            }

            const assignParam = (param: Param) => {
                param.n300 = n300;
                param.n100 = n100;
                param.n50 = n50;
                param.nmiss = nmiss;
            };

            switch (method) {
                case HttpMethod.Get:
                    assignParam(req.query);
                    break;

                case HttpMethod.Post:
                    assignParam(req.body);
                    break;
            }

            next();
        };

        UseMiddleware(middleware)(target, propertyKey, descriptor);
    };
}
