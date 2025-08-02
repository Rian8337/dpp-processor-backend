import { HttpMethod } from "@/types";
import { validateGamemode } from "@/utils/validators";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having a potentially valid gamemode.
 *
 * For GET requests, the gamemode is expected in the query parameters.
 * For POST requests, the gamemode is expected in the request body.
 *
 * The gamemode is expected to be in the key `gamemode`.
 *
 * @param required Whether the gamemode is required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the gamemode.
 */
export function GamemodeValidator(required = true): MethodDecorator {
    interface Param {
        gamemode?: string;
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let mode: string | undefined;

            switch (method) {
                case HttpMethod.Get:
                    mode = req.query.gamemode;
                    break;

                case HttpMethod.Post:
                    mode = req.body.gamemode;
                    break;
            }

            if (required && !mode) {
                res.status(400).json({ error: "Gamemode is required." });
                return;
            }

            if (mode) {
                try {
                    validateGamemode(mode);
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
