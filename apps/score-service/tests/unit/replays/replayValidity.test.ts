import type { ParsedReplay } from "@/replays/parseReplay";
import { isReplayValid } from "@/replays/replayValidity";
import { ModDoubleTime, ModHardRock, ModHidden } from "@rian8337/osu-base";
import { parsedReplayFor, scoreRow } from "@test/utils/rows";
import { describe, expect, it } from "vitest";

const score = scoreRow({ mods: JSON.stringify([new ModHidden().serialize()]) });

function replay(overrides: Partial<ParsedReplay> = {}): ParsedReplay {
    return parsedReplayFor(score, overrides);
}

describe("isReplayValid", () => {
    it("accepts a v3+ replay matching every field", () => {
        expect(isReplayValid(score, replay())).toBe(true);
    });

    it("accepts a v1/v2 replay matching hash and hit counts", () => {
        expect(
            isReplayValid(
                score,
                replay({ version: 2, v3: null, rank: "D", hit300k: 0 }),
            ),
        ).toBe(true);
    });

    it.each<[string, Partial<ParsedReplay>]>([
        ["another beatmap", { hash: "f".repeat(32) }],
        [
            "other hit counts",
            { accuracy: { n300: 1, n100: 0, n50: 0, nmiss: 0 } },
        ],
        [
            "no hits at all",
            { accuracy: { n300: 0, n100: 0, n50: 0, nmiss: 5 } },
        ],
        ["another rank", { rank: "A" }],
        ["other geki", { hit300k: 1 }],
        ["other katu", { hit100k: 1 }],
    ])("rejects %s", (_name, overrides) => {
        expect(isReplayValid(score, replay(overrides))).toBe(false);
    });

    it.each<[string, Partial<NonNullable<ParsedReplay["v3"]>>]>([
        ["another score", { score: 1 }],
        ["another combo", { maxCombo: 1 }],
        ["other mods", { mods: [new ModHardRock().serialize()] }],
    ])("rejects a v3 replay with %s", (_name, overrides) => {
        expect(
            isReplayValid(
                score,
                replay({ v3: { ...replay().v3!, ...overrides } }),
            ),
        ).toBe(false);
    });

    it("compares mods by meaning, not by order", () => {
        const both = scoreRow({
            ...score,
            mods: JSON.stringify([
                new ModHidden().serialize(),
                new ModDoubleTime().serialize(),
            ]),
        });

        expect(
            isReplayValid(
                both,
                replay({
                    v3: {
                        ...replay().v3!,
                        mods: [
                            new ModDoubleTime().serialize(),
                            new ModHidden().serialize(),
                        ],
                    },
                }),
            ),
        ).toBe(true);
    });

    it("rejects a score whose mods column is unreadable", () => {
        expect(
            isReplayValid(scoreRow({ ...score, mods: "not json" }), replay()),
        ).toBe(false);
    });
});
