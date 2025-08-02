import { CalculationMethod, HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid calculation method.
 *
 * In GET requests, the method is expected in the query parameters.
 * In POST requests, the method is expected in the request body.
 *
 * The method is expected to be in the key `calculationmethod`.
 *
 * @param required Whether the calculation method is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the calculation method.
 */
export function CalculationMethodValidator(required = true): MethodDecorator {
    interface Param {
        calculationmethod?: string | CalculationMethod;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let calculationMethod: number | undefined;

            const parseParam = (param: Param) => {
                if (param.calculationmethod !== undefined) {
                    calculationMethod = parseInt(
                        param.calculationmethod as string,
                    );
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

            if (required && calculationMethod === undefined) {
                res.status(400).json({
                    error: "Calculation method is required.",
                });
                return;
            }

            if (
                calculationMethod !== undefined && // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                calculationMethod !== CalculationMethod.live &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                calculationMethod !== CalculationMethod.rebalance
            ) {
                res.status(400).json({
                    error: `Invalid calculation method: ${calculationMethod.toString()}. Valid methods are: ${CalculationMethod.live.toString()}, ${CalculationMethod.rebalance.toString()}.`,
                });

                return;
            }

            const assignParam = (param: Param) => {
                param.calculationmethod = calculationMethod;
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
