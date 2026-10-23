import { getCaller } from "@/http/requestContext";
import type { UserRecord } from "@/registry/types";
import type { IRegistryService } from "@/services/IRegistryService";
import { ForbiddenError } from "@/types/errors";
import type { UserRole } from "@dpp/shared";
import type { Response } from "express";

/** Roles from lowest to highest. */
const roleRanks: Record<UserRole, number> = {
    manager: 1,
    admin: 2,
    owner: 3,
};

const requiredRoleMessages: Record<UserRole, string> = {
    owner: "This needs the owner role",
    admin: "This needs the admin or owner role",
    manager: "This needs the manager, admin, or owner role",
};

/**
 * Whether a role is at least the needed one, ranking owner above admin above manager. A person without a role (or an
 * unknown person) never qualifies.
 */
export function hasRole(
    actual: UserRole | null | undefined,
    needed: UserRole,
): boolean {
    return actual != null && roleRanks[actual] >= roleRanks[needed];
}

/**
 * Requires that the request acts for a person with at least the role. An owner satisfies every role and an admin
 * satisfies `"manager"`.
 *
 * The auth middleware has already rejected an acting uid from a key that may not act for users.
 *
 * @returns The acting person.
 * @throws {ForbiddenError} If there is no acting uid, or the person's role is too low.
 */
export function requireRole(
    registry: Pick<IRegistryService, "findUser">,
    res: Response,
    role: UserRole,
): { uid: number; role: UserRole } {
    const uid = requireActingUid(res);
    const actual = registry.findUser(uid)?.role ?? null;

    if (actual !== null && hasRole(actual, role)) {
        return { uid, role: actual };
    }

    throw new ForbiddenError(requiredRoleMessages[role]);
}

/**
 * Whether a person may manage a variant: an admin or owner may manage any variant, a manager only the variants they
 * are granted. A grant without a role manages nothing, and neither does an unknown person.
 */
export function canManageVariant(
    user: UserRecord | undefined,
    variantName: string,
): boolean {
    if (hasRole(user?.role, "admin")) {
        return true;
    }

    return user?.role === "manager" && user.grants.has(variantName);
}

/**
 * Requires that the request acts for a person who may manage the variant. See {@link canManageVariant}.
 *
 * @returns The acting person.
 * @throws {ForbiddenError} If there is no acting uid, or the person may not manage the variant.
 */
export function requireVariantManager(
    registry: Pick<IRegistryService, "findUser">,
    res: Response,
    variantName: string,
): { uid: number; role: UserRole } {
    const uid = requireActingUid(res);
    const user = registry.findUser(uid);

    if (!user?.role || !canManageVariant(user, variantName)) {
        throw new ForbiddenError("You cannot manage this variant");
    }

    return { uid, role: user.role };
}

/**
 * Requires that the acting person may change the target's access to a variant. An admin or owner may change anyone's;
 * a manager only another person's who has no role, so a manager can neither promote themselves nor touch other managers
 * or admins.
 *
 * @throws {ForbiddenError} If the actor may not change the target's access.
 */
export function requireGrantChangeAllowed(
    registry: Pick<IRegistryService, "findUser">,
    actor: { uid: number; role: UserRole },
    targetUid: number,
): void {
    if (hasRole(actor.role, "admin")) {
        return;
    }

    if (targetUid === actor.uid || registry.findUser(targetUid)?.role) {
        throw new ForbiddenError(
            "Managers can only change access for people without a role",
        );
    }
}

/**
 * Requires that the acting person may set the target's role as requested, following owner > admin > manager. Nobody
 * may change an owner over HTTP, owners are set only with the CLI. Only an owner may grant the admin role or change an
 * admin's role (an admin included, themselves too). An admin may otherwise set the manager role and remove it from a
 * manager. The route has already required at least the admin role.
 *
 * @throws {ForbiddenError} If the actor may not make the change.
 */
export function requireRoleChangeAllowed(
    registry: Pick<IRegistryService, "findUser">,
    actor: { uid: number; role: UserRole },
    targetUid: number,
    requested: "admin" | "manager" | null,
): void {
    const current = registry.findUser(targetUid)?.role ?? null;

    if (current === "owner") {
        throw new ForbiddenError("Owners can only be changed with the CLI");
    }

    if (
        !hasRole(actor.role, "owner") &&
        (current === "admin" || requested === "admin")
    ) {
        throw new ForbiddenError(
            "Only an owner can grant or change the admin role",
        );
    }
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
