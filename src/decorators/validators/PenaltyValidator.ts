import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having potentially valid penalty parameters.
 *
 * For GET requests, the penalty is expected in the query parameters.
 * For POST requests, the penalty is expected in the request body.
 *
 * The penalties are expected to be in the keys `aimslidercheesepenalty`,
 * `tappenalty`, `flashlightslidercheesepenalty`, and `visualslidercheesepenalty`.
 *
 * @param required Whether the penalty is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the penalty.
 */
export function PenaltyValidator(required = true): MethodDecorator {
    type Param = Partial<{
        aimslidercheesepenalty: string | number;
        tappenalty: string | number;
        flashlightslidercheesepenalty: string | number;
        visualslidercheesepenalty: string | number;
    }>;

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let aimSliderCheesePenalty: number | undefined;
            let tapPenalty: number | undefined;
            let flashlightSliderCheesePenalty: number | undefined;
            let visualSliderCheesePenalty: number | undefined;

            const parseParam = (param: Param) => {
                if (param.aimslidercheesepenalty !== undefined) {
                    aimSliderCheesePenalty = parseFloat(
                        param.aimslidercheesepenalty as string,
                    );
                }

                if (param.tappenalty !== undefined) {
                    tapPenalty = parseFloat(param.tappenalty as string);
                }

                if (param.flashlightslidercheesepenalty !== undefined) {
                    flashlightSliderCheesePenalty = parseFloat(
                        param.flashlightslidercheesepenalty as string,
                    );
                }

                if (param.visualslidercheesepenalty !== undefined) {
                    visualSliderCheesePenalty = parseFloat(
                        param.visualslidercheesepenalty as string,
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

            if (
                required &&
                (aimSliderCheesePenalty === undefined ||
                    tapPenalty === undefined ||
                    flashlightSliderCheesePenalty === undefined ||
                    visualSliderCheesePenalty === undefined)
            ) {
                res.status(400).json({
                    error: "All penalty parameters are required.",
                });
                return;
            }

            if (
                aimSliderCheesePenalty !== undefined &&
                (isNaN(aimSliderCheesePenalty) ||
                    aimSliderCheesePenalty < 0 ||
                    aimSliderCheesePenalty > 1)
            ) {
                res.status(400).json({
                    error: "Aim slider cheese penalty must be between 0 and 1.",
                });
                return;
            }

            if (
                tapPenalty !== undefined &&
                (isNaN(tapPenalty) ||
                    !Number.isFinite(tapPenalty) ||
                    tapPenalty > 1)
            ) {
                res.status(400).json({
                    error: "Tap penalty must be at least 1.",
                });
                return;
            }

            if (
                flashlightSliderCheesePenalty !== undefined &&
                (isNaN(flashlightSliderCheesePenalty) ||
                    flashlightSliderCheesePenalty < 0 ||
                    flashlightSliderCheesePenalty > 1)
            ) {
                res.status(400).json({
                    error: "Flashlight slider cheese penalty must be between 0 and 1.",
                });
                return;
            }

            if (
                visualSliderCheesePenalty !== undefined &&
                (isNaN(visualSliderCheesePenalty) ||
                    visualSliderCheesePenalty < 0 ||
                    visualSliderCheesePenalty > 1)
            ) {
                res.status(400).json({
                    error: "Visual slider cheese penalty must be between 0 and 1.",
                });
                return;
            }

            const assignParam = (param: Param) => {
                param.aimslidercheesepenalty = aimSliderCheesePenalty;
                param.tappenalty = tapPenalty;
                param.flashlightslidercheesepenalty =
                    flashlightSliderCheesePenalty;
                param.visualslidercheesepenalty = visualSliderCheesePenalty;
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
