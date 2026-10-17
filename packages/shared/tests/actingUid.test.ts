import { describe, expect, it } from "vitest";
import { parseActingUid } from "../src";

describe("parseActingUid", () => {
    it("returns undefined when the header is absent", () => {
        expect(parseActingUid(undefined)).toBeUndefined();
    });

    it.each(["1", "42", "2147483647"])("parses %s", (value) => {
        expect(parseActingUid(value)).toBe(Number(value));
    });

    it.each([
        "",
        "0",
        "-1",
        "01",
        "1.5",
        "1e3",
        " 1",
        "1 ",
        "+1",
        "abc",
        "2147483648",
        "99999999999999999999",
    ])("rejects %j", (value) => {
        expect(parseActingUid(value)).toBe("invalid");
    });
});
