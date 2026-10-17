import { setCaller } from "@/http/requestContext";
import { anonymousCaller } from "@/registry/snapshot";
import type { IRegistryService } from "@/services/IRegistryService";
import type { ApiKeyRecord } from "@/registry/types";
import { InvalidActingUidError, KeyRequiredError } from "@/types/errors";
import { UnauthorizedError } from "@dpp/server";
import { parseActingUid as parseActingUidValue } from "@dpp/shared";
import type { RequestHandler } from "express";

/**
 * Reads the `X-Acting-Uid` header value: `undefined` if the header is absent, otherwise the uid.
 *
 * @param header The raw header value, `undefined` if the header was not sent.
 * @param key The authenticated key, `undefined` for an anonymous caller.
 * @throws {InvalidActingUidError} If the caller may not act for users, or the value is not a positive 32-bit integer.
 */
export function parseActingUid(
    header: string | undefined,
    key: ApiKeyRecord | undefined,
): number | undefined {
    if (header === undefined) {
        return undefined;
    }

    if (!key?.canActForUsers) {
        throw new InvalidActingUidError("not-allowed");
    }

    const uid = parseActingUidValue(header);

    if (uid === "invalid") {
        throw new InvalidActingUidError("malformed");
    }

    return uid;
}

/**
 * Identifies the caller. No `X-Api-Key` header means anonymous, unless anonymous access is off; a header with an
 * unknown or revoked key, including an empty one, is rejected rather than treated as anonymous, so a misconfigured
 * client notices at once.
 *
 * A key that can act for users may send `X-Acting-Uid`; the caller then carries that uid.
 */
export function createAuthMiddleware(
    registry: Pick<IRegistryService, "authenticate">,
    options: { readonly allowAnonymous: boolean },
): RequestHandler {
    return (req, res, next) => {
        const raw = req.get("x-api-key");

        if (raw === undefined && !options.allowAnonymous) {
            res.status(401).json(new KeyRequiredError().toResponse());

            return;
        }

        const key = raw === undefined ? undefined : registry.authenticate(raw);

        if (raw !== undefined && !key) {
            res.status(401).json(new UnauthorizedError().toResponse());

            return;
        }

        let actingUid: number | undefined;

        try {
            actingUid = parseActingUid(req.get("x-acting-uid"), key);
        } catch (e) {
            if (e instanceof InvalidActingUidError) {
                res.status(e.statusCode).json(e.toResponse());

                return;
            }

            throw e;
        }

        setCaller(
            res,
            !key
                ? anonymousCaller
                : actingUid === undefined
                  ? { kind: "key", key }
                  : { kind: "key", key, actingUid },
        );
        next();
    };
}
