import type { DanCourseScore } from "@/mongo/documents";
import { danCourseGrade } from "@/services/danCourseGrade";
import { Accuracy } from "@rian8337/osu-base";
import { describe, expect, it } from "vitest";

const score: DanCourseScore = {
    uid: 7,
    username: "player",
    hash: "h",
    mods: [],
    score: 1000,
    maxCombo: 300,
    rank: "S",
    geki: 0,
    perfect: 90,
    katu: 0,
    good: 8,
    bad: 1,
    miss: 1,
    date: 0,
    grade: 0,
};

describe("danCourseGrade", () => {
    it.each([
        ["score", 1000],
        ["combo", 300],
        ["m300", 90],
        ["m100", 8],
        ["m50", 1],
        ["miss", 1],
        ["rank", 5],
        ["unknown", 0],
    ])("grades the %s requirement as %d", (id, expected) => {
        expect(danCourseGrade(id, score)).toBe(expected);
    });

    it("grades accuracy", () => {
        expect(danCourseGrade("acc", score)).toBe(
            new Accuracy({ n300: 90, n100: 8, n50: 1, nmiss: 1 }).value,
        );
    });

    it.each([
        ["XH", 8],
        ["SH", 7],
        ["X", 6],
        ["S", 5],
        ["A", 4],
        ["B", 3],
        ["C", 2],
        ["D", 1],
        ["?", 1],
    ])("grades rank %s as %d", (rank, expected) => {
        expect(danCourseGrade("rank", { ...score, rank })).toBe(expected);
    });
});
