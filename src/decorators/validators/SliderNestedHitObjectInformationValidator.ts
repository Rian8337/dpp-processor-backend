import { HttpMethod } from "@/types";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having potentially valid slider nested hit object information.
 *
 * For GET requests, the information are expected in the query parameters.
 * For POST requests, the information are expected in the request body.
 *
 * The information are expected to be in the keys `sliderticksmissed` and `sliderendsdropped`.
 *
 * @param required Whether the information is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the information.
 */
export function SliderNestedHitObjectInformationValidator(
    required = true,
): MethodDecorator {
    type Param = Partial<{
        sliderticksmissed: string | number;
        sliderendsdropped: string | number;
    }>;

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let sliderTicksMissed: number | undefined;
            let sliderEndsDropped: number | undefined;

            const parseParam = (param: Param) => {
                if (param.sliderticksmissed !== undefined) {
                    sliderTicksMissed = parseInt(
                        param.sliderticksmissed as string,
                    );
                }

                if (param.sliderendsdropped !== undefined) {
                    sliderEndsDropped = parseInt(
                        param.sliderendsdropped as string,
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
                (sliderTicksMissed === undefined ||
                    sliderEndsDropped === undefined)
            ) {
                res.status(400).json({
                    error: "Slider tick hits and end hits are required.",
                });
                return;
            }

            if (sliderTicksMissed !== undefined && sliderTicksMissed < 0) {
                res.status(400).json({
                    error: "Slider tick hits must be a non-negative integer.",
                });
                return;
            }

            if (sliderEndsDropped !== undefined && sliderEndsDropped < 0) {
                res.status(400).json({
                    error: "Slider end hits must be a non-negative integer.",
                });
                return;
            }

            const assignParam = (param: Param) => {
                if (sliderTicksMissed !== undefined) {
                    param.sliderticksmissed = sliderTicksMissed;
                }

                if (sliderEndsDropped !== undefined) {
                    param.sliderendsdropped = sliderEndsDropped;
                }
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
