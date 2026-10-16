import { ScoreRecalculationService } from "@/services/ScoreRecalculationService";
import { BestScoreWriter } from "@/services/BestScoreWriter";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { RetryLaterError } from "@/types/errors";
import { RankedStatus } from "@rian8337/osu-base";
import { performanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    beatmapNotFound,
    FakeBeatmapServiceClient,
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    retryLater,
} from "@test/utils/fakes";
import { bestScoreRow, scoreRow, testHash } from "@test/utils/rows";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ScoreRecalculationService", () => {
    let official: InMemoryOfficialScoreRepository;
    let replays: InMemoryReplayStore;
    let broker: FakeBrokerClient;
    let beatmaps: FakeBeatmapServiceClient;
    let total: number;
    let service: ScoreRecalculationService;

    beforeEach(() => {
        official = new InMemoryOfficialScoreRepository();
        replays = new InMemoryReplayStore();
        total = 100;
        broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(total),
        }));
        beatmaps = new FakeBeatmapServiceClient((hash) => ({
            ok: true,
            value: { hash, title: "T", rankedStatus: RankedStatus.Ranked },
        }));
        const calculator = new ScoreCalculator(broker);

        service = new ScoreRecalculationService(
            official,
            beatmaps,
            calculator,
            new BestScoreWriter(calculator, replays, testConfig),
            replays,
            testConfig,
        );
    });

    it("does nothing for a missing score", async () => {
        await service.recalculate(1);

        expect(beatmaps.calls).toEqual([]);
        expect(broker.calls).toEqual([]);
    });

    it("invalidates a score of value 0 without calculating", async () => {
        official.scores = [scoreRow({ id: 1, score: 0, pp: 50 })];
        official.bestScores = [bestScoreRow({ id: 1, pp: 50 })];

        await service.recalculate(1);

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores[0]!.pp).toBe(0);
        expect(broker.calls).toEqual([]);
    });

    it.each([
        ["missing", () => ({ ...beatmapNotFound })],
        [
            "loved",
            (hash: string) => ({
                ok: true as const,
                value: { hash, title: "T", rankedStatus: RankedStatus.Loved },
            }),
        ],
        [
            "qualified",
            (hash: string) => ({
                ok: true as const,
                value: {
                    hash,
                    title: "T",
                    rankedStatus: RankedStatus.Qualified,
                },
            }),
        ],
    ])("invalidates a score on a %s beatmap", async (_, answer) => {
        official.scores = [scoreRow({ id: 1, pp: 50 })];
        official.bestScores = [bestScoreRow({ id: 1, pp: 50 })];
        beatmaps.answer = answer as typeof beatmaps.answer;

        await service.recalculate(1);

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores[0]!.pp).toBe(0);
        expect(broker.calls).toEqual([]);
    });

    it.each([401, 500])(
        "throws RetryLaterError and changes nothing when the beatmap service answers %i",
        async (status) => {
            official.scores = [scoreRow({ id: 1, pp: 50 })];
            official.bestScores = [bestScoreRow({ id: 1, pp: 50 })];
            beatmaps.answer = () => ({
                ok: false,
                kind: "retry",
                status,
                code: "BEATMAP_SERVICE_UNAVAILABLE",
                message: "m",
            });

            await expect(service.recalculate(1)).rejects.toBeInstanceOf(
                RetryLaterError,
            );
            expect(official.scores[0]!.pp).toBe(50);
            expect(official.bestScores[0]!.pp).toBe(50);
        },
    );

    it.each([
        ["score value 0", { score: 0 }, undefined],
        ["beatmap not found", {}, () => ({ ...beatmapNotFound })],
        [
            "beatmap not ranked or approved (status 4)",
            {},
            (hash: string) => ({
                ok: true as const,
                value: { hash, title: "T", rankedStatus: RankedStatus.Loved },
            }),
        ],
    ])("logs why it invalidated: %s", async (reason, row, answer) => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        official.scores = [scoreRow({ id: 7, pp: 50, ...row })];
        official.bestScores = [bestScoreRow({ id: 7, pp: 50 })];

        if (answer) {
            beatmaps.answer = answer as typeof beatmaps.answer;
        }

        await service.recalculate(7);

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining(`score 7: ${reason}`),
        );
        log.mockRestore();
    });

    it("calculates a score on an approved beatmap", async () => {
        official.scores = [scoreRow({ id: 1, pp: null })];
        beatmaps.answer = (hash) => ({
            ok: true,
            value: { hash, title: "T", rankedStatus: RankedStatus.Approved },
        });

        await service.recalculate(1);

        expect(official.scores[0]!.pp).toBe(100);
    });

    it("throws RetryLaterError and changes nothing when the beatmap service asks to retry", async () => {
        official.scores = [scoreRow({ id: 1, pp: 50 })];
        beatmaps.answer = () => retryLater;

        await expect(service.recalculate(1)).rejects.toBeInstanceOf(
            RetryLaterError,
        );
        expect(official.scores[0]!.pp).toBe(50);
    });

    it("applies the multiplier, records the best row, and copies the replay", async () => {
        official.scores = [scoreRow({ id: 1, pp: null, ppMultiplier: 0.8 })];
        replays.put("online", "1.odr", "replay");

        await service.recalculate(1);

        expect(official.scores[0]!.pp).toBe(80);
        expect(official.bestScores).toEqual([
            {
                ...bestScoreRow({ id: 1 }),
                filename: "T",
                pp: 80,
                ppMultiplier: 0.8,
            },
        ]);
        expect(replays.files.get("best")!.get("1.odr")?.toString()).toBe(
            "replay",
        );
        expect(beatmaps.calls).toEqual([{ lane: "bulk", hash: testHash }]);
    });

    it.each([
        [null, 100, 1],
        [1.4, 100, 1.4],
    ])(
        "multiplier %s gives pp %s and stores %s",
        async (stored, pp, storedMultiplier) => {
            official.scores = [
                scoreRow({ id: 1, pp: null, ppMultiplier: stored }),
            ];

            await service.recalculate(1);

            expect(official.scores[0]!.pp).toBe(pp);
            expect(official.bestScores[0]).toMatchObject({
                pp,
                ppMultiplier: storedMultiplier,
            });
        },
    );

    it("keeps a higher best row of another score, but writes the score's pp", async () => {
        official.scores = [scoreRow({ id: 1, pp: null })];
        official.bestScores = [bestScoreRow({ id: 2, pp: 150 })];
        replays.put("best", "2.odr", "other");
        // The other best row is recalculated higher: 150 > 100.
        let calls = 0;
        broker.onPerformance = () => ({
            ok: true,
            value: performanceBody(calls++ === 0 ? 100 : 150),
        });

        await service.recalculate(1);

        expect(official.scores[0]!.pp).toBe(100);
        expect(official.bestScores.map((s) => s.id)).toEqual([2]);
        expect(replays.files.get("best")!.has("2.odr")).toBe(true);
    });

    it("clears the score's pp on a permanent calculation failure, leaving best rows", async () => {
        official.scores = [scoreRow({ id: 1, pp: 50 })];
        official.bestScores = [bestScoreRow({ id: 2, pp: 70 })];
        broker.onPerformance = () => beatmapNotFound;

        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await service.recalculate(1);

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining(
                "score 1: calculation rejected (BEATMAP_NOT_FOUND)",
            ),
        );
        log.mockRestore();

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores).toEqual([bestScoreRow({ id: 2, pp: 70 })]);
    });

    it("throws RetryLaterError and changes nothing when the broker asks to retry", async () => {
        official.scores = [scoreRow({ id: 1, pp: 50 })];
        broker.onPerformance = () => retryLater;

        await expect(service.recalculate(1)).rejects.toBeInstanceOf(
            RetryLaterError,
        );
        expect(official.scores[0]!.pp).toBe(50);
        expect(official.bestScores).toEqual([]);
    });

    it("deletes the replay of a replaced best row after the transaction", async () => {
        official.scores = [scoreRow({ id: 1, pp: null })];
        official.bestScores = [bestScoreRow({ id: 2, pp: 10 })];
        replays.put("best", "2.odr", "old");
        replays.put("online", "1.odr", "new");
        // The old best row is recalculated lower: 10 < 100.
        let calls = 0;
        broker.onPerformance = () => ({
            ok: true,
            value: performanceBody(calls++ === 0 ? 100 : 10),
        });

        await service.recalculate(1);

        expect(official.bestScores.map((s) => s.id)).toEqual([1]);
        expect(replays.files.get("best")!.has("2.odr")).toBe(false);
        expect(replays.files.get("best")!.has("1.odr")).toBe(true);
    });

    it("replaces the score's own best row from an earlier run without duplicating it", async () => {
        official.scores = [scoreRow({ id: 1, pp: 30 })];
        official.bestScores = [bestScoreRow({ id: 1, pp: 30 })];
        replays.put("best", "1.odr", "kept");

        await service.recalculate(1);

        expect(official.bestScores).toHaveLength(1);
        expect(official.bestScores[0]).toMatchObject({ id: 1, pp: 100 });
        expect(replays.files.get("best")!.has("1.odr")).toBe(true);
    });
});
