import { getCaller } from "@/http/requestContext";
import type { IRegistryService } from "@/services/IRegistryService";
import { ForbiddenError } from "@/types/errors";
import type { UserRole } from "@dpp/shared";
import type { Response } from "express";

/**
 * Requires that the request acts for a person with at least the role. An admin satisfies `"manager"`.
 *
 * The auth middleware has already rejected an acting uid from a key that may not act for users.
 *
 * @returns The acting person.
 * @throws {ForbiddenError} If there is no acting uid, or the person's role is too low.
 */
export function requireRole(
    registry: Pick<IRegistryService, "findUser">,
    res: Response,
    role: "manager" | "admin",
): { uid: number; role: UserRole } {
    const uid = requireActingUid(res);
    const actual = registry.findUser(uid)?.role ?? null;

    if (actual === "admin" || (actual === "manager" && role === "manager")) {
        return { uid, role: actual };
    }

    throw new ForbiddenError(
        role === "admin"
            ? "This needs the admin role"
            : "This needs the manager or admin role",
    );
}

/**
 * The name of the key the request was made with, or `undefined` for an anonymous request.
 */
export function callerKeyName(res: Response): string | undefined {
    const caller = getCaller(res);

    return caller.kind === "key" ? caller.key.name : undefined;
}

/**
 * The uid the request acts for.
 *
 * @throws {ForbiddenError} If the request does not act for anyone.
 */
export function requireActingUid(res: Response): number {
    const caller = getCaller(res);

    if (caller.kind !== "key" || caller.actingUid === undefined) {
        throw new ForbiddenError(
            "This needs a key that can act for users and an X-Acting-Uid header",
        );
    }

    return caller.actingUid;
}
