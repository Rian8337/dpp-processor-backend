import {
    canManageVariant,
    hasRole,
    requireRoleChangeAllowed,
} from "@/controllers/adminAccess";
import type { UserRecord } from "@/registry/types";
import { ForbiddenError } from "@/types/errors";
import type { UserRole } from "@dpp/shared";
import { describe, expect, it } from "vitest";

describe("hasRole", () => {
    const roles: (UserRole | null | undefined)[] = [
        "owner",
        "admin",
        "manager",
        null,
        undefined,
    ];
    const needed: UserRole[] = ["owner", "admin", "manager"];
    const rank = { owner: 3, admin: 2, manager: 1 };

    const cases = roles.flatMap((actual) =>
        needed.map(
            (role) =>
                [
                    actual,
                    role,
                    actual != null && rank[actual] >= rank[role],
                ] as const,
        ),
    );

    it.each(cases)("%s needing %s is %s", (actual, role, expected) => {
        expect(hasRole(actual, role)).toBe(expected);
    });
});

describe("canManageVariant", () => {
    it("allows an admin on any variant", () => {
        expect(
            canManageVariant(
                { uid: 1, role: "admin", grants: new Set() },
                "flowaim",
            ),
        ).toBe(true);
    });

    it("allows an owner on any variant", () => {
        expect(
            canManageVariant(
                { uid: 6, role: "owner", grants: new Set() },
                "flowaim",
            ),
        ).toBe(true);
    });

    it("allows a manager with a grant on the variant", () => {
        expect(
            canManageVariant(
                { uid: 2, role: "manager", grants: new Set(["flowaim"]) },
                "flowaim",
            ),
        ).toBe(true);
    });

    it("refuses a manager without a grant on the variant", () => {
        expect(
            canManageVariant(
                { uid: 2, role: "manager", grants: new Set(["other"]) },
                "flowaim",
            ),
        ).toBe(false);
    });

    it("refuses a grant without a role, and an unknown person", () => {
        expect(
            canManageVariant(
                { uid: 3, role: null, grants: new Set(["flowaim"]) },
                "flowaim",
            ),
        ).toBe(false);
        expect(canManageVariant(undefined, "flowaim")).toBe(false);
    });
});

describe("requireRoleChangeAllowed", () => {
    const users = new Map<number, UserRecord>([
        [1, { uid: 1, role: "admin", grants: new Set() }],
        [2, { uid: 2, role: "manager", grants: new Set() }],
        [6, { uid: 6, role: "owner", grants: new Set() }],
        [9, { uid: 9, role: "admin", grants: new Set() }],
    ]);
    const registry = { findUser: (uid: number) => users.get(uid) };

    const ownerOnly = "Owners can only be changed with the CLI";
    const adminRole = "Only an owner can grant or change the admin role";

    const cases: [
        { uid: number; role: UserRole },
        number,
        "admin" | "manager" | null,
        string,
    ][] = [
        [{ uid: 6, role: "owner" }, 9, null, "ok"],
        [{ uid: 6, role: "owner" }, 9, "manager", "ok"],
        [{ uid: 6, role: "owner" }, 9, "admin", "ok"],
        [{ uid: 6, role: "owner" }, 2, "admin", "ok"],
        [{ uid: 6, role: "owner" }, 5, "admin", "ok"],
        [{ uid: 6, role: "owner" }, 6, "admin", ownerOnly],
        [{ uid: 1, role: "admin" }, 6, null, ownerOnly],
        [{ uid: 1, role: "admin" }, 9, "manager", adminRole],
        [{ uid: 1, role: "admin" }, 9, null, adminRole],
        [{ uid: 1, role: "admin" }, 1, null, adminRole],
        [{ uid: 1, role: "admin" }, 1, "manager", adminRole],
        [{ uid: 1, role: "admin" }, 5, "admin", adminRole],
        [{ uid: 1, role: "admin" }, 5, "manager", "ok"],
        [{ uid: 1, role: "admin" }, 2, null, "ok"],
    ];

    it.each(cases)(
        "actor %o on uid %i requesting %s: %s",
        (actor, target, requested, expected) => {
            let thrown: unknown;

            try {
                requireRoleChangeAllowed(registry, actor, target, requested);
            } catch (e) {
                thrown = e;
            }

            expect(thrown).toEqual(
                expected === "ok" ? undefined : new ForbiddenError(expected),
            );
        },
    );
});
