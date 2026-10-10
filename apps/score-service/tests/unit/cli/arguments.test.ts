import { CliUsageError, parseCliArguments } from "@/cli/arguments";
import { describe, expect, it } from "vitest";

const base = ["recalculate-scores", "--name", "rescore-2026"];

describe("parseCliArguments", () => {
    it("applies defaults", () => {
        expect(
            parseCliArguments([...base, "--from", "1", "--to", "100"]),
        ).toEqual({
            name: "recalculate-scores",
            job: "rescore-2026",
            from: 1,
            to: 100,
            concurrency: 4,
            chunkSize: 1000,
        });
    });

    it("reads concurrency and chunk size for both recalculation commands", () => {
        expect(
            parseCliArguments([
                "recalculate-total-pp",
                "--name",
                "pp",
                "--from",
                "1",
                "--to",
                "9",
                "--concurrency",
                "8",
                "--chunk-size",
                "50",
            ]),
        ).toEqual({
            name: "recalculate-total-pp",
            job: "pp",
            from: 1,
            to: 9,
            concurrency: 8,
            chunkSize: 50,
        });
    });

    it("parses job-status", () => {
        expect(parseCliArguments(["job-status", "rescore-2026"])).toEqual({
            name: "job-status",
            job: "rescore-2026",
        });
    });

    it("accepts the largest integer ID", () => {
        expect(
            parseCliArguments([
                ...base,
                "--from",
                "2147483647",
                "--to",
                "2147483647",
            ]),
        ).toMatchObject({ from: 2147483647, to: 2147483647 });
    });

    it.each<[string, string[], string]>([
        ["no command", [], "command is required"],
        ["an unknown command", ["frobnicate"], "Unknown command"],
        [
            "a missing name",
            ["recalculate-scores", "--from", "1", "--to", "2"],
            "--name",
        ],
        ["a missing from", [...base, "--to", "2"], "--from is required"],
        ["a missing to", [...base, "--from", "1"], "--to is required"],
        [
            "from greater than to",
            [...base, "--from", "5", "--to", "4"],
            "--from must not be greater than --to",
        ],
        ["from 0", [...base, "--from", "0", "--to", "4"], "--from"],
        [
            "a fractional from",
            [...base, "--from", "1.5", "--to", "4"],
            "--from",
        ],
        [
            "a non-numeric from",
            [...base, "--from", "abc", "--to", "4"],
            "--from",
        ],
        [
            "to above the integer limit",
            [...base, "--from", "1", "--to", "2147483648"],
            "2147483647",
        ],
        [
            "from above the integer limit",
            [...base, "--from", "2147483648", "--to", "2147483648"],
            "2147483647",
        ],
        [
            "zero concurrency",
            [...base, "--from", "1", "--to", "4", "--concurrency", "0"],
            "--concurrency",
        ],
        [
            "zero chunk size",
            [...base, "--from", "1", "--to", "4", "--chunk-size", "0"],
            "--chunk-size",
        ],
        [
            "an invalid name",
            [
                "recalculate-scores",
                "--name",
                "Bad_Name",
                "--from",
                "1",
                "--to",
                "4",
            ],
            "--name",
        ],
        [
            "an unknown option",
            [...base, "--from", "1", "--to", "4", "--bogus", "1"],
            "bogus",
        ],
        ["job-status without a name", ["job-status"], "exactly one"],
        ["job-status with two names", ["job-status", "a", "b"], "exactly one"],
    ])("rejects %s", (_, argv, message) => {
        expect(() => parseCliArguments(argv)).toThrow(CliUsageError);
        expect(() => parseCliArguments(argv)).toThrow(message);
    });
});
