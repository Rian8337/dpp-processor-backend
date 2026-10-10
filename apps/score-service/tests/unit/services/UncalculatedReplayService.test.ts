import { BestScoreWriter } from "@/services/BestScoreWriter";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { calculateUserTotals } from "@/services/userTotals";
import { UncalculatedReplayService } from "@/services/UncalculatedReplayService";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    beatmapNotFound,
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    retryLater,
} from "@test/utils/fakes";
import { bestScoreRow, scoreRow, uncalculatedRow } from "@test/utils/rows";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PerformanceResult = ReturnType<FakeBrokerClient["onPerformance"]>;

describe("UncalculatedReplayService", () => {
    let official: InMemoryOfficialScoreRepository;
    let replays: InMemoryReplayStore;
    let broker: FakeBrokerClient;
    let service: UncalculatedReplayService;
    let log: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;
    // Answers successive `performance` calls: first the no-penalty total, then any best-score recalculation.
    let performanceResults: (() => PerformanceResult)[];

    function build(concurrency = 1) {
        service = new UncalculatedReplayService(
            official,
            replays,
            new ScoreCalculator(broker),
            new BestScoreWriter(
                new ScoreCalculator(broker),
                replays,
                testConfig,
            ),
            { ...testConfig, uncalculatedConcurrency: concurrency },
        );
    }

    function totals(total: number): () => PerformanceResult {
        return () => ({ ok: true, value: performanceBody(total) });
    }

    beforeEach(() => {
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        official = new InMemoryOfficialScoreRepository();
        official.users.push({
            id: 7,
            username: "player",
            pp: 0,
            accuracy: 1,
            lastLoginTime: null,
        });
        official.scores = [scoreRow({ id: 50, score: 1_000_000, pp: null })];
        official.uncalculatedScores = [
            uncalculatedRow({
                replayfilename: "r.odr",
                score: 1_000_000,
                perfect: 401,
            }),
        ];
        replays = new InMemoryReplayStore();
        replays.put("uncalculated", "r.odr", "replay");
        performanceResults = [totals(100)];
        broker = new FakeBrokerClient(
            () => (performanceResults.shift() ?? totals(100))(),
            () => ({ ok: true, value: replayPerformanceBody(90) }),
        );
        build();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function expectUntouched() {
        expect(official.uncalculatedScores).toHaveLength(1);
        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores).toEqual([]);
        expect(official.users[0]!.pp).toBe(0);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(true);
    }

    it("calculates the replay and records it as the best score", async () => {
        await expect(service.processFile("r.odr")).resolves.toBe("processed");

        expect(official.scores[0]!.pp).toBe(90);
        expect(official.bestScores).toEqual([
            {
                ...bestScoreRow({ id: 50, perfect: 401 }),
                filename: uncalculatedRow().filename,
                pp: 90,
                ppMultiplier: 0.9,
            },
        ]);
        expect(replays.files.get("best")!.get("50.odr")?.toString()).toBe(
            "replay",
        );
        expect(official.users[0]).toMatchObject(
            calculateUserTotals([{ pp: 90, accuracy: 0.95 }]),
        );
        expect(official.uncalculatedScores).toEqual([]);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(false);
    });

    it("leaves the leaderboard pp when the score values differ, but still writes the best row", async () => {
        official.scores = [scoreRow({ id: 50, score: 999, pp: null })];

        await service.processFile("r.odr");

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores.map((s) => s.id)).toEqual([50]);
    });

    it("keeps an existing best score that still beats the new one", async () => {
        official.bestScores = [bestScoreRow({ id: 40, pp: 80 })];
        performanceResults = [totals(100), totals(95)];

        await service.processFile("r.odr");

        expect(official.bestScores.map((s) => [s.id, s.pp])).toEqual([
            [40, 95],
        ]);
        expect(official.users[0]!.pp).toBe(0);
        expect(official.uncalculatedScores).toEqual([]);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(false);
    });

    it("replaces a worse best score and deletes its replay", async () => {
        official.bestScores = [bestScoreRow({ id: 40, pp: 80 })];
        replays.put("best", "40.odr", "old");
        performanceResults = [totals(100), totals(50)];

        await service.processFile("r.odr");

        expect(official.bestScores.map((s) => s.id)).toEqual([50]);
        expect(replays.files.get("best")!.has("40.odr")).toBe(false);
        expect(replays.files.get("best")!.has("50.odr")).toBe(true);
    });

    it("deletes the file when no row describes it", async () => {
        official.uncalculatedScores = [];

        await expect(service.processFile("r.odr")).resolves.toBe("processed");

        expect(official.scores[0]!.pp).toBeNull();
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(false);
        expect(broker.calls).toEqual([]);
    });

    it("drops the row and file when there is no leaderboard score", async () => {
        official.scores = [];

        await expect(service.processFile("r.odr")).resolves.toBe("processed");

        expect(official.uncalculatedScores).toEqual([]);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(false);
        expect(broker.calls).toEqual([]);
    });

    it.each([
        [
            "the replay calculation",
            () => {
                broker.onReplay = () => beatmapNotFound;
            },
        ],
        [
            "the no-penalty calculation",
            () => {
                performanceResults = [() => beatmapNotFound];
            },
        ],
    ])("clears the pp when %s fails permanently", async (_name, fail) => {
        official.scores = [scoreRow({ id: 50, score: 1_000_000, pp: 33 })];
        fail();

        await expect(service.processFile("r.odr")).resolves.toBe("processed");

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores).toEqual([]);
        expect(official.uncalculatedScores).toEqual([]);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(false);
    });

    it("keeps everything when the replay calculation must be retried", async () => {
        broker.onReplay = () => retryLater;

        await expect(service.processFile("r.odr")).resolves.toBe("kept");

        expectUntouched();
    });

    it("rolls back when recalculating the current best must be retried", async () => {
        official.bestScores = [bestScoreRow({ id: 40, pp: 80 })];
        performanceResults = [totals(100), () => retryLater];

        await expect(service.processFile("r.odr")).resolves.toBe("kept");

        expect(official.scores[0]!.pp).toBeNull();
        expect(official.bestScores.map((s) => [s.id, s.pp])).toEqual([
            [40, 80],
        ]);
        expect(official.uncalculatedScores).toHaveLength(1);
        expect(replays.files.get("uncalculated")!.has("r.odr")).toBe(true);
    });

    it("keeps the file when the database fails", async () => {
        vi.spyOn(official, "setScorePP").mockRejectedValue(
            new Error("database down"),
        );

        await expect(service.processFile("r.odr")).resolves.toBe("kept");

        expectUntouched();
        expect(error).toHaveBeenCalled();
    });

    it("removes the row of a file that vanished", async () => {
        replays.files.get("uncalculated")!.delete("r.odr");

        await expect(service.processFile("r.odr")).resolves.toBe("processed");

        expect(official.uncalculatedScores).toEqual([]);
    });

    describe("runPass", () => {
        beforeEach(() => {
            official.uncalculatedScores = [];
            replays.files.get("uncalculated")!.clear();

            for (const name of ["a.odr", "b.odr", "c.odr", "d.odr"]) {
                replays.put("uncalculated", name, name);
            }
        });

        it("processes every file with limited concurrency", async () => {
            build(2);

            let active = 0;
            let peak = 0;
            const seen: string[] = [];

            vi.spyOn(service, "processFile").mockImplementation(
                async (name) => {
                    seen.push(name);
                    active++;
                    peak = Math.max(peak, active);
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    active--;
                    return "processed";
                },
            );

            await service.runPass();

            expect(seen.sort()).toEqual(["a.odr", "b.odr", "c.odr", "d.odr"]);
            expect(peak).toBe(2);
            expect(log).toHaveBeenCalledWith(
                "Calculating 4 uncalculated replay(s)",
            );
        });

        it("starts nothing once aborted", async () => {
            const processFile = vi.spyOn(service, "processFile");
            const controller = new AbortController();

            controller.abort();
            await service.runPass(controller.signal);

            expect(processFile).not.toHaveBeenCalled();
        });

        it("does nothing for an empty folder", async () => {
            replays.files.get("uncalculated")!.clear();

            await service.runPass();

            expect(log).not.toHaveBeenCalled();
        });
    });
});
