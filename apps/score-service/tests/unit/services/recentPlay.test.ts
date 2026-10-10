import type { ParsedReplay } from "@/replays/parseReplay";
import { toRecentPlay } from "@/services/recentPlay";
import { ModHidden } from "@rian8337/osu-base";
import { replayPerformanceBody } from "@test/utils/bodies";
import { testHash } from "@test/utils/rows";
import { afterEach, describe, expect, it, vi } from "vitest";

const mods = [new ModHidden().serialize()];
const hits = { n300: 100, n100: 2, n50: 1, nmiss: 0 };

const replay: ParsedReplay = {
    version: 4,
    hash: testHash,
    fileName: "Artist - Title (Mapper) [Hard].osu",
    accuracy: hits,
    rank: "S",
    hit300k: 10,
    hit100k: 1,
    v3: {
        score: 50000,
        maxCombo: 150,
        mods,
        playerName: "player",
        time: new Date("2026-10-01T00:00:00Z"),
    },
};

const droidPerformance = {
    total: 120,
    aim: 50,
    tap: 40,
    accuracy: 20,
    flashlight: 0,
    reading: 10,
    deviation: 15,
    tapDeviation: 12,
    tapPenalty: 1,
    sliderCheesePenalty: 1,
};

const droidExtra = {
    difficulty: { mods, starRating: 5, maxCombo: 160 },
    performance: {
        ...droidPerformance,
        sliderCheesePenalty: 1,
        effectiveMissCount: 0,
    },
    score: {
        ...hits,
        combo: 150,
        totalScore: 50000,
        sliderTicksMissed: 3,
        sliderEndsDropped: 1,
        tapPenalty: 1,
        sliderCheesePenalty: 1,
    },
    replay: {
        hitError: { negativeAvg: -10, positiveAvg: 10, unstableRate: 80 },
        sliderTickInformation: { obtained: 10, total: 13 },
        sliderEndInformation: { obtained: 9, total: 10 },
    },
};

const droid = replayPerformanceBody(0, droidExtra);

const osuPerformance = {
    total: 90,
    aim: 40,
    speed: 30,
    accuracy: 15,
    flashlight: 0,
};

const osu = replayPerformanceBody(0, {
    difficulty: { mods, starRating: 4 },
    performance: { ...osuPerformance, reading: 5, effectiveMissCount: 0 },
    score: {
        ...hits,
        combo: 150,
        totalScore: 50000,
        tapPenalty: 1,
        sliderCheesePenalty: 1,
    },
});

const date = new Date("2026-10-10T00:00:00Z");
const title = "Artist - Title (Mapper) [Hard]";

describe("toRecentPlay", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("builds today's recent play document", () => {
        expect(
            toRecentPlay({
                uid: 7,
                scoreId: 99,
                replay,
                title,
                droid,
                osu,
                date,
            }),
        ).toEqual({
            uid: 7,
            title,
            combo: 150,
            score: 50000,
            rank: "S",
            date,
            accuracy: hits,
            mods,
            hash: testHash,
            scoreId: 99,
            hitError: { negativeAvg: -10, positiveAvg: 10, unstableRate: 80 },
            sliderTickInformation: { obtained: 10, total: 13 },
            sliderEndInformation: { obtained: 9, total: 10 },
            droidAttribs: {
                params: {
                    mods,
                    accuracy: hits,
                    combo: 150,
                    totalScore: 50000,
                    sliderTicksMissed: 3,
                    sliderEndsDropped: 1,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
                difficulty: { mods, starRating: 5, maxCombo: 160 },
                performance: droidPerformance,
            },
            osuAttribs: {
                params: {
                    mods,
                    accuracy: hits,
                    combo: 150,
                    totalScore: 50000,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
                difficulty: { mods, starRating: 4 },
                performance: osuPerformance,
            },
        });
    });

    it("leaves out attributes and replay details without calculations", () => {
        const play = toRecentPlay({
            uid: 7,
            scoreId: 99,
            replay,
            title,
            droid: null,
            osu: null,
            date,
        });

        for (const key of [
            "droidAttribs",
            "osuAttribs",
            "hitError",
            "sliderTickInformation",
            "sliderEndInformation",
        ]) {
            expect(play).not.toHaveProperty(key);
        }
    });

    it("leaves out replay details the calculation did not produce", () => {
        const play = toRecentPlay({
            uid: 7,
            scoreId: 99,
            replay,
            title,
            droid: replayPerformanceBody(0, {
                ...droidExtra,
                replay: {
                    hitError: null,
                    sliderTickInformation: null,
                    sliderEndInformation: null,
                },
            }),
            osu: null,
            date,
        });

        expect(play).toHaveProperty("droidAttribs");
        expect(play).not.toHaveProperty("hitError");
        expect(play).not.toHaveProperty("sliderTickInformation");
        expect(play).not.toHaveProperty("sliderEndInformation");
    });

    it("leaves out attributes of the wrong shape and logs it", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const play = toRecentPlay({
            uid: 7,
            scoreId: 99,
            replay,
            title,
            droid: osu,
            osu: droid,
            date,
        });

        expect(play).not.toHaveProperty("droidAttribs");
        expect(play).not.toHaveProperty("osuAttribs");
        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("unexpected performance attributes"),
        );
    });

    it("does not store undefined optional parameters", () => {
        const play = toRecentPlay({
            uid: 7,
            scoreId: 99,
            replay,
            title,
            droid: replayPerformanceBody(0, {
                ...droidExtra,
                score: {
                    ...hits,
                    combo: 150,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
            }),
            osu: null,
            date,
        });

        expect(play.droidAttribs!.params).not.toHaveProperty("totalScore");
        expect(play.droidAttribs!.params).not.toHaveProperty(
            "sliderTicksMissed",
        );
        expect(play.droidAttribs!.params).not.toHaveProperty(
            "sliderEndsDropped",
        );
    });
});
