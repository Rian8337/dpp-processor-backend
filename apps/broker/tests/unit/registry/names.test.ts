import { isValidName } from "@/registry/names";
import { describe, expect, it } from "vitest";

describe("isValidName", () => {
    it.each(["droid-live", "a", "0", "flowaim-2026-10"])(
        "accepts %s",
        (name) => {
            expect(isValidName(name)).toBe(true);
        },
    );

    it.each([
        "",
        "-live",
        "Droid",
        "droid_live",
        "droid live",
        "droid/live",
        "dröid",
    ])("rejects %j", (name) => {
        expect(isValidName(name)).toBe(false);
    });
});
