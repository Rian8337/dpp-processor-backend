import { HttpMethod } from "@/types";
import { SerializedMod } from "@rian8337/osu-base";
import { RequestHandler } from "express";
import { UseMiddleware } from "../middleware";

/**
 * Marks a route as having potentially valid mods.
 *
 * For GET requests, the mods are expected in the query parameters.
 * For POST requests, the mods are expected in the request body.
 *
 * The mods are expected to be in the key `mods`.
 *
 * @param required Whether the mods are required. Defaults to `true`.
 * @returns A method decorator that applies a middleware to validate the mods.
 */
export function ModsValidator(required = true): MethodDecorator {
    interface Param {
        mods?: string | SerializedMod[];
    }

    return (target, propertyKey, descriptor) => {
        const middleware: RequestHandler<
            unknown,
            { error: string },
            Param,
            Param
        > = (req, res, next) => {
            const method = req.method.toLowerCase() as HttpMethod;
            let mods: string | undefined;

            switch (method) {
                case HttpMethod.Get:
                    mods = req.query.mods as string;
                    break;

                case HttpMethod.Post:
                    mods = req.body.mods as string;
                    break;
            }

            if (required && !mods) {
                res.status(400).json({ error: "Mods are required." });
                return;
            }

            if (mods) {
                try {
                    const parsedMods = JSON.parse(mods) as SerializedMod[];

                    if (!Array.isArray(parsedMods)) {
                        throw new Error("Mods must be an array.");
                    }

                    // Check if every mod is a valid SerializedMod
                    for (const mod of parsedMods) {
                        if (typeof mod !== "object" || !mod.acronym) {
                            throw new TypeError(
                                `Invalid mod: ${JSON.stringify(mod)}. Each mod must be a SerializedMod object.`,
                            );
                        }
                    }

                    switch (method) {
                        case HttpMethod.Get:
                            req.query.mods = parsedMods;
                            break;

                        case HttpMethod.Post:
                            req.body.mods = parsedMods;
                            break;
                    }
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
