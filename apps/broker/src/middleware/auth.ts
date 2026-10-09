import { setCaller } from "@/http/requestContext";
import { anonymousCaller } from "@/registry/snapshot";
import type { IRegistryService } from "@/services/IRegistryService";
import { KeyRequiredError } from "@/types/errors";
import { UnauthorizedError } from "@dpp/server";
import type { RequestHandler } from "express";

/**
 * Identifies the caller. No `X-Api-Key` header means anonymous, unless anonymous access is off; a header with an
 * unknown or revoked key, including an empty one, is rejected rather than treated as anonymous, so a misconfigured
 * client notices at once.
 */
export function createAuthMiddleware(
    registry: Pick<IRegistryService, "authenticate">,
    options: { readonly allowAnonymous: boolean },
): RequestHandler {
    return (req, res, next) => {
        const raw = req.get("x-api-key");

        if (raw === undefined) {
            if (!options.allowAnonymous) {
                res.status(401).json(new KeyRequiredError().toResponse());

                return;
            }

            setCaller(res, anonymousCaller);
            next();

            return;
        }

        const key = registry.authenticate(raw);

        if (!key) {
            res.status(401).json(new UnauthorizedError().toResponse());

            return;
        }

        setCaller(res, { kind: "key", key });
        next();
    };
}
