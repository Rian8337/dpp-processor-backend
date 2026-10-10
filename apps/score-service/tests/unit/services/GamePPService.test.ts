import type { ReplayParser } from "@/replays/parseReplay";
import { GamePPService } from "@/services/GamePPService";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { ModDoubleTime, ModHidden } from "@rian8337/osu-base";
import type { CalculateScoreFields } from "@dpp/shared";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    beatmapNotFound,
    FakeBrokerClient,
    retryLater,
} from "@test/utils/fakes";
import { parsedReplayFor, scoreRow, testHash } from "@test/utils/rows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fields: CalculateScoreFields = {
    hash: testHash,
    mods: [new ModHidden().serialize()],
    combo: 100,
    perfect: 90,
    good: 5,
    bad: 1,
    miss: 2,
    totalScore: 123456,
    sliderHits: { head: 10, tick: 20, repeat: 1, end: 9 },
    ppMultiplier: 0.5,
};
const nothing = { pp: null, pp_multiplier: null };
const replayFile = Buffer.from("replay");

describe("GamePPService", () => {
    let broker: FakeBrokerClient;
    let totals: number[];
    let parsed: ReturnType<typeof parsedReplayFor> | null;
    let log: ReturnType<typeof vi.spyOn>;
    let service: GamePPService;

    beforeEach(() => {
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        totals = [];
        parsed = null;
        broker = new FakeBrokerClient(
            () => ({
                ok: true,
                value: performanceBody(totals.shift() ?? 0, {
                    difficulty: {
                        mods: [new ModDoubleTime().serialize()],
                        starRating: 5,
                    },
                }),
            }),
            () => ({
                ok: true,
                value: replayPerformanceBody(totals.shift() ?? 0, {
                    difficulty: {
                        mods: [new ModDoubleTime().serialize()],
                        starRating: 5,
                    },
                }),
            }),
        );

        const parse: ReplayParser = () => Promise.resolve(parsed);

        service = new GamePPService(
            new ScoreCalculator(broker),
            parse,
            testConfig,
        );
    });

    it("calculates a score and its pp multiplier", async () => {
        totals = [80, 100];

        expect(await service.calculateScore(fields)).toEqual({
            pp: 40,
            pp_multiplier: 0.4,
        });
        expect(broker.calls).toHaveLength(2);
        expect(broker.calls[0]).toEqual({
            kind: "performance",
            variant: "live-droid",
            request: {
                beatmap: { hash: testHash },
                mods: [new ModHidden().serialize()],
                score: {
                    n300: 90,
                    n100: 5,
                    n50: 1,
                    nmiss: 2,
                    combo: 100,
                    totalScore: 123456,
                    sliderHeadHits: 10,
                    sliderTickHits: 20,
                    sliderRepeatHits: 1,
                    sliderEndHits: 9,
                },
                strainChart: false,
            },
        });
        expect(broker.calls[1]).toEqual({
            kind: "performance",
            variant: "live-droid",
            request: {
                beatmap: { hash: testHash },
                mods: [new ModDoubleTime().serialize()],
                score: {
                    n300: 100,
                    n100: 0,
                    n50: 0,
                    nmiss: 0,
                    combo: 200,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
            },
        });
    });

    it("gives a multiplier of 1 when the no-penalty total is 0", async () => {
        totals = [80, 0];

        expect(await service.calculateScore(fields)).toEqual({
            pp: 40,
            pp_multiplier: 1,
        });
    });

    it("uses the requested variant for both calls", async () => {
        totals = [80, 100];

        await service.calculateScore({ ...fields, variant: "droid-test" });

        expect(broker.calls.map((call) => call.variant)).toEqual([
            "droid-test",
            "droid-test",
        ]);
    });

    it("answers nulls and logs when the calculation fails", async () => {
        broker.onPerformance = () => beatmapNotFound;

        expect(await service.calculateScore(fields)).toEqual(nothing);
        expect(broker.calls).toHaveLength(1);
        expect(log).toHaveBeenCalledWith(
            expect.stringMatching(/calculate-score failed.*BEATMAP_NOT_FOUND/),
        );
    });

    it("answers nulls when the no-penalty calculation fails", async () => {
        let calls = 0;

        broker.onPerformance = () =>
            ++calls === 1
                ? { ok: true, value: performanceBody(80) }
                : retryLater;

        expect(await service.calculateScore(fields)).toEqual(nothing);
        expect(broker.calls).toHaveLength(2);
    });

    it("calculates a version 7 replay and its pp multiplier", async () => {
        const row = scoreRow();

        parsed = parsedReplayFor(row, { version: 7 });
        totals = [90, 100];

        expect(await service.calculateReplay(replayFile)).toEqual({
            pp: 90,
            pp_multiplier: 0.9,
        });
        expect(broker.calls).toEqual([
            {
                kind: "replay",
                variant: "live-droid",
                request: {
                    replay: replayFile.toString("base64"),
                    strainChart: false,
                },
            },
            {
                kind: "performance",
                variant: "live-droid",
                request: {
                    beatmap: { hash: row.hash },
                    mods: [new ModDoubleTime().serialize()],
                    score: {
                        n300: 100,
                        n100: 0,
                        n50: 0,
                        nmiss: 0,
                        combo: 200,
                        tapPenalty: 1,
                        sliderCheesePenalty: 1,
                    },
                },
            },
        ]);
    });

    it.each([
        [
            "version 6",
            (row: ReturnType<typeof scoreRow>) =>
                parsedReplayFor(row, { version: 6 }),
        ],
        [
            "a v2 replay",
            (row: ReturnType<typeof scoreRow>) =>
                parsedReplayFor(row, { version: 2, v3: null }),
        ],
        ["an unparsable replay", () => null],
    ])("answers nulls without calling the broker for %s", async (_, make) => {
        parsed = make(scoreRow());

        expect(await service.calculateReplay(replayFile)).toEqual(nothing);
        expect(broker.calls).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("unsupported or unreadable replay"),
        );
    });

    it("uses the requested variant for a replay", async () => {
        parsed = parsedReplayFor(scoreRow(), { version: 7 });
        totals = [90, 100];

        await service.calculateReplay(replayFile, "droid-test");

        expect(broker.calls.map((call) => call.variant)).toEqual([
            "droid-test",
            "droid-test",
        ]);
    });
});
