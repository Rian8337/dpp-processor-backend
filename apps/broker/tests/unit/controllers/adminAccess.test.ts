import { canManageVariant, hasRole } from "@/controllers/adminAccess";
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
