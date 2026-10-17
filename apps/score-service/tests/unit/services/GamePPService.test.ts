import type { ReplayParser } from "@/replays/parseReplay";
import { GamePPService } from "@/services/GamePPService";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { ModDoubleTime, ModHidden, RankedStatus } from "@rian8337/osu-base";
import type { CalculateScoreFields } from "@dpp/shared";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    beatmapNotFound,
    FakeBeatmapServiceClient,
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
const failed = { kind: "failed" };
const replayFile = Buffer.from("replay");

describe("GamePPService", () => {
    let broker: FakeBrokerClient;
    let beatmaps: FakeBeatmapServiceClient;
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

        beatmaps = new FakeBeatmapServiceClient();

        const parse: ReplayParser = () => Promise.resolve(parsed);

        service = new GamePPService(
            new ScoreCalculator(broker),
            beatmaps,
            parse,
            testConfig,
        );
    });

    it("calculates a score and its pp multiplier", async () => {
        totals = [80, 100];

        expect(await service.calculateScore(fields)).toEqual({
            kind: "ok",
            response: { pp: 40, pp_multiplier: 0.4 },
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
            kind: "ok",
            response: { pp: 40, pp_multiplier: 1 },
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

    it("is a permanent failure and logs when the calculation is rejected", async () => {
        broker.onPerformance = () => beatmapNotFound;

        expect(await service.calculateScore(fields)).toEqual(failed);
        expect(broker.calls).toHaveLength(1);
        expect(log).toHaveBeenCalledWith(
            expect.stringMatching(/calculate-score failed.*BEATMAP_NOT_FOUND/),
        );
    });

    it.each([
        ["a busy upstream", retryLater],
        [
            "a rejected UNAUTHORIZED",
            {
                ok: false,
                kind: "rejected",
                status: 401,
                code: "UNAUTHORIZED",
                message: "bad key",
            } as const,
        ],
        [
            "a rejected VARIANT_NOT_FOUND",
            {
                ok: false,
                kind: "rejected",
                status: 404,
                code: "VARIANT_NOT_FOUND",
                message: "no variant",
            } as const,
        ],
    ])("is retry later for %s", async (_, answer) => {
        broker.onPerformance = () => answer;
        broker.onReplay = () => answer;
        parsed = parsedReplayFor(scoreRow(), { version: 7 });

        expect(await service.calculateScore(fields)).toEqual({
            kind: "retry",
        });
        expect(await service.calculateReplay(replayFile)).toEqual({
            kind: "retry",
        });
    });

    it("answers a permanent failure when the no-penalty calculation is rejected", async () => {
        let calls = 0;

        broker.onPerformance = () =>
            ++calls === 1
                ? { ok: true, value: performanceBody(80) }
                : beatmapNotFound;

        expect(await service.calculateScore(fields)).toEqual(failed);
        expect(broker.calls).toHaveLength(2);
    });

    it("is retry later when the no-penalty calculation is busy", async () => {
        let calls = 0;

        broker.onPerformance = () =>
            ++calls === 1
                ? { ok: true, value: performanceBody(80) }
                : retryLater;

        expect(await service.calculateScore(fields)).toEqual({
            kind: "retry",
        });
        expect(broker.calls).toHaveLength(2);
    });

    it("calculates a version 7 replay and its pp multiplier", async () => {
        const row = scoreRow();

        parsed = parsedReplayFor(row, { version: 7 });
        totals = [90, 100];

        expect(await service.calculateReplay(replayFile)).toEqual({
            kind: "ok",
            response: { pp: 90, pp_multiplier: 0.9 },
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
    ])(
        "is a permanent failure without calling the broker for %s",
        async (_, make) => {
            parsed = make(scoreRow());

            expect(await service.calculateReplay(replayFile)).toEqual(failed);
            expect(broker.calls).toEqual([]);
            expect(log).toHaveBeenCalledWith(
                expect.stringContaining("unsupported or unreadable replay"),
            );
        },
    );

    it("uses the requested variant for a replay", async () => {
        parsed = parsedReplayFor(scoreRow(), { version: 7 });
        totals = [90, 100];

        await service.calculateReplay(replayFile, "droid-test");

        expect(broker.calls.map((call) => call.variant)).toEqual([
            "droid-test",
            "droid-test",
        ]);
    });

    describe("beatmap status", () => {
        function withStatus(rankedStatus: RankedStatus) {
            beatmaps.answer = (hash) => ({
                ok: true,
                value: { hash, title: "T", rankedStatus },
            });
        }

        const calls = [
            ["calculate-score", () => service.calculateScore(fields)],
            [
                "calculate-replay",
                () => {
                    parsed = parsedReplayFor(scoreRow(), { version: 7 });
                    return service.calculateReplay(replayFile);
                },
            ],
        ] as const;

        it.each(calls)(
            "%s looks the beatmap up on the priority lane",
            async (_, call) => {
                totals = [80, 100];

                await call();

                expect(beatmaps.calls).toEqual([
                    { lane: "priority", hash: testHash },
                ]);
            },
        );

        it.each(calls)("%s calculates an approved beatmap", async (_, call) => {
            withStatus(RankedStatus.Approved);
            totals = [80, 100];

            expect(await call()).toMatchObject({ kind: "ok" });
        });

        it.each(
            calls.flatMap(([route, call]) =>
                [
                    RankedStatus.Graveyard,
                    RankedStatus.Wip,
                    RankedStatus.Pending,
                    RankedStatus.Qualified,
                    RankedStatus.Loved,
                ].map((status) => [route, status, call] as const),
            ),
        )(
            "%s is a permanent failure without calling the broker for status %i",
            async (route, status, call) => {
                withStatus(status);

                expect(await call()).toEqual(failed);
                expect(broker.calls).toEqual([]);
                expect(log).toHaveBeenCalledWith(
                    expect.stringMatching(
                        new RegExp(`${route} failed.*not ranked or approved`),
                    ),
                );
            },
        );

        it.each(calls)(
            "%s is a permanent failure without calling the broker for a missing beatmap",
            async (route, call) => {
                beatmaps.answer = () => ({ ok: true, value: null });

                expect(await call()).toEqual(failed);
                expect(broker.calls).toEqual([]);
                expect(log).toHaveBeenCalledWith(
                    expect.stringMatching(
                        new RegExp(`${route} failed.*beatmap not found`),
                    ),
                );
            },
        );

        it.each(calls)(
            "%s is retry later when the beatmap service is unavailable",
            async (_, call) => {
                beatmaps.answer = () => retryLater;

                expect(await call()).toEqual({ kind: "retry" });
                expect(broker.calls).toEqual([]);
            },
        );
    });
});
