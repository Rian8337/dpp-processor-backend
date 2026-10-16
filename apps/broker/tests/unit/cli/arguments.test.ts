import {
    expectPositionals,
    instanceUrl,
    parseArguments,
    parseLimit,
    requireValidName,
} from "@/cli/arguments";
import { CliError } from "@/cli/errors";
import { describe, expect, it } from "vitest";

describe("CLI arguments", () => {
    it("parses options and positionals", () => {
        const { values, positionals } = parseArguments(
            ["droid-live", "--public"],
            { public: { type: "boolean", default: false } },
        );

        expect(values.public).toBe(true);
        expect(positionals).toEqual(["droid-live"]);
    });

    it("turns argument errors into CLI errors", () => {
        expect(() => parseArguments(["--nope"], {})).toThrow(CliError);
        expect(() =>
            parseArguments(["--limit"], { limit: { type: "string" } }),
        ).toThrow(CliError);
    });

    it("checks the number of positionals", () => {
        expect(expectPositionals(["a", "b"], ["alias", "variant"])).toEqual([
            "a",
            "b",
        ]);
        expect(() => expectPositionals(["a"], ["alias", "variant"])).toThrow(
            "Expected <alias> <variant>",
        );
        expect(() => expectPositionals(["a"], [])).toThrow(
            "Expected no arguments",
        );
    });

    it("rejects invalid names", () => {
        expect(() => requireValidName("Droid Live")).toThrow(
            'Invalid name "Droid Live": use lowercase letters, digits, and hyphens',
        );
        expect(() => requireValidName("droid-live")).not.toThrow();
    });

    it("parses rate limits", () => {
        expect(parseLimit("60", false)).toBe(60);
        expect(parseLimit(undefined, true)).toBeNull();
        expect(parseLimit(undefined, false)).toBeUndefined();
        expect(() => parseLimit("60", true)).toThrow(
            "only one of --limit or --unlimited",
        );
        expect(() => parseLimit("0", false)).toThrow("Invalid limit");
        expect(() => parseLimit("1.5", false)).toThrow("Invalid limit");
    });

    it("builds instance URLs from a port or a URL", () => {
        expect(instanceUrl({ port: "3101" })).toBe("http://127.0.0.1:3101");
        expect(instanceUrl({ url: "https://10.0.0.5:3101/dpp/" })).toBe(
            "https://10.0.0.5:3101/dpp",
        );
        expect(() => instanceUrl({})).toThrow("exactly one of --port or --url");
        expect(() => instanceUrl({ port: "1", url: "http://x" })).toThrow(
            "exactly one of --port or --url",
        );
        expect(() => instanceUrl({ port: "70000" })).toThrow("Invalid port");
        expect(() => instanceUrl({ url: "ftp://x" })).toThrow("http or https");
        expect(() => instanceUrl({ url: "not a url" })).toThrow("Invalid URL");
        expect(() => instanceUrl({ url: "http://x/?a=1" })).toThrow("query");
        expect(() => instanceUrl({ url: "http://user:secret@host:1" })).toThrow(
            "credentials",
        );
        expect(() =>
            instanceUrl({ url: "http://user:secret@host:1" }),
        ).not.toThrow(/secret/);
    });
});
