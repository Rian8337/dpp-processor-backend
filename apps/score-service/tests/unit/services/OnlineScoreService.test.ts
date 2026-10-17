import type { ParsedReplay, ReplayParser } from "@/replays/parseReplay";
import { OnlineScoreService } from "@/services/OnlineScoreService";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { ScoreNotFoundError, UpstreamError } from "@/types/errors";
import { ModHidden } from "@rian8337/osu-base";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import {
    beatmapNotFound,
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    retryLater,
} from "@test/utils/fakes";
import {
    bestScoreRow,
    parsedReplayFor,
    scoreRow,
    testHash,
} from "@test/utils/rows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = {
    uid: 7,
    hash: testHash,
    variant: "live-droid",
    best: false,
    strainChart: false,
};
const replayFile = Buffer.from("replay");

describe("OnlineScoreService", () => {
    let repository: InMemoryOfficialScoreRepository;
    let replays: InMemoryReplayStore;
    let broker: FakeBrokerClient;
    let parsed: ParsedReplay | null;
    let service: OnlineScoreService;

    beforeEach(() => {
        repository = new InMemoryOfficialScoreRepository();
        replays = new InMemoryReplayStore();
        broker = new FakeBrokerClient(
            () => ({ ok: true, value: performanceBody(120) }),
            () => ({ ok: true, value: replayPerformanceBody(120) }),
        );
        parsed = null;

        const parse: ReplayParser = () => Promise.resolve(parsed);

        service = new OnlineScoreService(
            repository,
            replays,
            new ScoreCalculator(broker),
            broker,
            parse,
        );
    });

    it("rejects an unknown score, and an unknown best score", async () => {
        await expect(service.lookup(query)).rejects.toBeInstanceOf(
            ScoreNotFoundError,
        );
        await expect(
            service.lookup({ ...query, best: true }),
        ).rejects.toBeInstanceOf(ScoreNotFoundError);
    });

    it("calculates a valid v3 replay without overrides", async () => {
        const row = scoreRow({ id: 10 });

        repository.scores.push(row);
        replays.put("online", "10.odr", replayFile);
        parsed = parsedReplayFor(row);

        const response = await service.lookup(query);

        expect(broker.calls).toEqual([
            {
                kind: "replay",
                variant: "live-droid",
                request: {
                    replay: replayFile.toString("base64"),
                    strainChart: false,
                },
            },
        ]);
        expect(response).toEqual({
            score: { id: 10, uid: 7, hash: testHash, best: false, mods: [] },
            source: "replay",
            ppMultiplier: 1,
            pp: 120,
            calculation: replayPerformanceBody(120),
        });
    });

    it("takes mods and stats from the score for a v2 replay", async () => {
        const row = scoreRow({
            id: 10,
            mods: JSON.stringify([new ModHidden().serialize()]),
        });

        repository.scores.push(row);
        replays.put("online", "10.odr", replayFile);
        parsed = parsedReplayFor(row, { version: 2, v3: null, rank: "D" });
        // v1/v2 replays do not record the rank or geki/katu, so the row must not demand them.
        repository.scores[0] = { ...row, mark: "D", geki: 0, katu: 0 };

        const response = await service.lookup(query);

        expect(response.source).toBe("replay");
        expect(broker.calls).toHaveLength(1);
        expect(broker.calls[0]).toMatchObject({
            kind: "replay",
            request: {
                mods: [new ModHidden().serialize()],
                score: { n300: 400, n100: 20, n50: 2, nmiss: 1, combo: 500 },
            },
        });
    });

    it.each([
        ["a replay", true],
        ["the stored stats", false],
    ])(
        "reports the score's mods when calculating from %s",
        async (_, withReplay) => {
            const row = scoreRow({
                id: 10,
                mods: JSON.stringify([new ModHidden().serialize()]),
            });

            repository.scores.push(row);

            if (withReplay) {
                replays.put("online", "10.odr", replayFile);
                parsed = parsedReplayFor(row);
            }

            const response = await service.lookup(query);

            expect(response.source).toBe(withReplay ? "replay" : "score");
            expect(response.score.mods).toEqual([new ModHidden().serialize()]);
        },
    );

    it("falls back to the stored stats when the replay is invalid", async () => {
        const row = scoreRow({ id: 10, ppMultiplier: 0.5 });

        repository.scores.push(row);
        replays.put("online", "10.odr", replayFile);
        parsed = parsedReplayFor(row, { hash: "f".repeat(32) });

        const response = await service.lookup(query);

        expect(broker.calls).toHaveLength(1);
        expect(broker.calls[0]).toMatchObject({
            kind: "performance",
            request: { beatmap: { hash: testHash } },
        });
        expect(response).toMatchObject({
            source: "score",
            ppMultiplier: 0.5,
            pp: 60,
        });
    });

    it.each([
        [1.3, 1],
        [null, 1],
        [0.5, 0.5],
    ])(
        "applies a stored multiplier of %s as %s when the replay is missing",
        async (stored, expected) => {
            repository.scores.push(scoreRow({ id: 10, ppMultiplier: stored }));

            const response = await service.lookup(query);

            expect(response.source).toBe("score");
            expect(response.ppMultiplier).toBe(expected);
            expect(response.pp).toBe(120 * expected);
        },
    );

    it("treats an unreadable replay as missing", async () => {
        repository.scores.push(scoreRow({ id: 10 }));
        vi.spyOn(replays, "readScoreReplay").mockRejectedValue(
            Object.assign(new Error("EACCES"), { code: "EACCES" }),
        );
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const response = await service.lookup(query);

        expect(response.source).toBe("score");
        expect(broker.calls.map((c) => c.kind)).toEqual(["performance"]);
        expect(warn).toHaveBeenCalledOnce();
    });

    it("ignores the multiplier for an osu variant", async () => {
        repository.scores.push(scoreRow({ id: 10, ppMultiplier: 0.5 }));

        const response = await service.lookup({
            ...query,
            variant: "live-osu",
        });

        expect(response.ppMultiplier).toBe(1);
        expect(response.pp).toBe(120);
    });

    it("reads the highest best row and its replay", async () => {
        const low = bestScoreRow({ id: 20, pp: 50 });
        const high = bestScoreRow({ id: 21, pp: 90 });

        repository.bestScores.push(low, high);
        replays.put("best", "21.odr", replayFile);
        parsed = parsedReplayFor(high);

        const response = await service.lookup({ ...query, best: true });

        expect(response.score).toEqual({
            id: 21,
            uid: 7,
            hash: testHash,
            best: true,
            mods: [],
        });
        expect(response.source).toBe("replay");
    });

    it("forwards strainChart in both paths and passes the chart through", async () => {
        const row = scoreRow({ id: 10 });
        const chart = { strainChart: "chart-data" };

        broker.onPerformance = () => ({
            ok: true,
            value: performanceBody(120, chart),
        });
        broker.onReplay = () => ({
            ok: true,
            value: replayPerformanceBody(120, chart),
        });
        repository.scores.push(row);

        const stats = await service.lookup({ ...query, strainChart: true });

        expect(stats.calculation).toMatchObject(chart);

        replays.put("online", "10.odr", replayFile);
        parsed = parsedReplayFor(row);

        const replay = await service.lookup({ ...query, strainChart: true });

        expect(replay.calculation).toMatchObject(chart);
        expect(broker.calls.map((c) => c.request.strainChart)).toEqual([
            true,
            true,
        ]);
    });

    it("passes the acting uid to every broker call", async () => {
        const row = scoreRow({ id: 10 });

        repository.scores.push(row);

        await service.lookup(query, 5);

        expect(broker.modeCalls).toEqual([
            { variant: "live-droid", actingUid: 5 },
        ]);
        expect(broker.calls).toMatchObject([
            { kind: "performance", actingUid: 5 },
        ]);

        replays.put("online", "10.odr", replayFile);
        parsed = parsedReplayFor(row);
        broker.calls.length = 0;
        broker.modeCalls.length = 0;

        await service.lookup(query, 5);

        expect(broker.calls).toMatchObject([{ kind: "replay", actingUid: 5 }]);
    });

    it("sends no acting uid when none is given", async () => {
        repository.scores.push(scoreRow({ id: 10 }));

        await service.lookup(query);

        expect(broker.modeCalls).toEqual([{ variant: "live-droid" }]);
        expect(broker.calls[0]).not.toHaveProperty("actingUid");
    });

    it("passes broker failures through as upstream errors", async () => {
        repository.scores.push(scoreRow({ id: 10 }));
        broker.onPerformance = () => beatmapNotFound;

        await expect(service.lookup(query)).rejects.toMatchObject({
            statusCode: 404,
            code: "BEATMAP_NOT_FOUND",
        });

        broker.onPerformance = () => retryLater;

        const error = await service.lookup(query).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({ statusCode: 503 });
    });

    it("rejects an unknown variant on the stats path", async () => {
        repository.scores.push(scoreRow({ id: 10 }));

        await expect(
            service.lookup({ ...query, variant: "nope" }),
        ).rejects.toMatchObject({
            statusCode: 404,
            code: "VARIANT_NOT_FOUND",
        });
    });
});
