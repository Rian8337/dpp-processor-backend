import { canManageVariant } from "@/controllers/adminAccess";
import { describe, expect, it } from "vitest";

describe("canManageVariant", () => {
    it("allows an admin on any variant", () => {
        expect(
            canManageVariant(
                { uid: 1, role: "admin", grants: new Set() },
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
