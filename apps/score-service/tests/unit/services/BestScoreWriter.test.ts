import { scoreColumns } from "@/official/types";
import { BestScoreWriter } from "@/services/BestScoreWriter";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { RetryLaterError } from "@/types/errors";
import { performanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    beatmapNotFound,
    retryLater,
} from "@test/utils/fakes";
import { bestScoreRow, scoreRow, testHash } from "@test/utils/rows";
import { describe, expect, it, vi } from "vitest";

function setup(
    currentTotal: () => ReturnType<FakeBrokerClient["onPerformance"]> = () => ({
        ok: true,
        value: performanceBody(100),
    }),
) {
    const repository = new InMemoryOfficialScoreRepository();
    const replays = new InMemoryReplayStore();
    const broker = new FakeBrokerClient(currentTotal);
    const writer = new BestScoreWriter(
        new ScoreCalculator(broker),
        replays,
        testConfig,
    );

    return { repository, replays, broker, writer };
}

function candidate(
    id: number,
    pp: number,
    replay: Buffer | null = Buffer.from(`replay ${id.toString()}`),
) {
    return {
        score: scoreColumns(scoreRow({ id })),
        pp,
        ppMultiplier: 0.9,
        title: "New Title",
        replay,
    };
}

describe("BestScoreWriter", () => {
    it("records the candidate when there is no best score", async () => {
        const { repository, replays, writer } = setup();

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: true, staleReplayIds: [] });
        expect(repository.bestScores).toEqual([
            {
                ...bestScoreRow({ id: 5 }),
                filename: "New Title",
                pp: 50,
                ppMultiplier: 0.9,
            },
        ]);
        expect(replays.files.get("best")!.get("5.odr")?.toString()).toBe(
            "replay 5",
        );
        expect(repository.lockedUsers).toEqual([7]);
    });

    it("replaces a lower best score and reports its replay as stale", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(40),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 999 })];

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: true, staleReplayIds: [3] });
        expect(repository.bestScores.map((s) => s.id)).toEqual([5]);
    });

    it("compares against the recalculated pp, with the stored multiplier", async () => {
        // Stored 999, but recalculated 100 × 0.4 = 40 < 50.
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(100),
        }));

        repository.bestScores = [
            bestScoreRow({ id: 3, pp: 999, ppMultiplier: 0.4 }),
        ];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(true);
    });

    it("keeps the current best on a tie and updates its pp", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(50),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 70 })];

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: false, staleReplayIds: [] });
        expect(repository.bestScores).toMatchObject([{ id: 3, pp: 50 }]);
    });

    it("keeps a higher best score", async () => {
        const { repository, replays, writer } = setup(() => ({
            ok: true,
            value: performanceBody(80),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 80 })];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(false);
        expect(replays.files.get("best")!.has("5.odr")).toBe(false);
    });

    it("removes duplicates in both branches", async () => {
        const higher = setup(() => ({ ok: true, value: performanceBody(10) }));

        higher.repository.bestScores = [
            bestScoreRow({ id: 3, pp: 30 }),
            bestScoreRow({ id: 4, pp: 20 }),
        ];
        expect(
            await higher.writer.consider(higher.repository, candidate(5, 50)),
        ).toEqual({ changed: true, staleReplayIds: [3, 4] });
        expect(higher.repository.bestScores.map((s) => s.id)).toEqual([5]);

        const lower = setup(() => ({ ok: true, value: performanceBody(80) }));

        lower.repository.bestScores = [
            bestScoreRow({ id: 3, pp: 30 }),
            bestScoreRow({ id: 4, pp: 20 }),
        ];
        expect(
            await lower.writer.consider(lower.repository, candidate(5, 50)),
        ).toEqual({ changed: false, staleReplayIds: [4] });
        expect(lower.repository.bestScores.map((s) => s.id)).toEqual([3]);
    });

    it("does not report the candidate's own replay as stale when it replaces its own row", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(10),
        }));

        repository.bestScores = [bestScoreRow({ id: 5, pp: 10 })];

        expect(await writer.consider(repository, candidate(5, 50))).toEqual({
            changed: true,
            staleReplayIds: [],
        });
    });

    it("records a candidate without a replay and logs it", async () => {
        const log = vi
            .spyOn(console, "log")
            .mockImplementation(() => undefined);
        const { repository, replays, writer } = setup();

        expect(
            (await writer.consider(repository, candidate(5, 50, null))).changed,
        ).toBe(true);
        expect(replays.files.get("best")!.size).toBe(0);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("score 5 has no replay"),
        );
    });

    it("uses the stored pp when the current best cannot be calculated", async () => {
        const { repository, writer } = setup(() => beatmapNotFound);

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(false);
        expect(repository.bestScores).toMatchObject([{ id: 3, pp: 60 }]);
    });

    it("throws RetryLaterError when the broker asks to retry", async () => {
        const { repository, writer } = setup(() => retryLater);

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];

        await expect(
            writer.consider(repository, candidate(5, 50)),
        ).rejects.toBeInstanceOf(RetryLaterError);
    });

    it("recalculates the current best with the live droid variant", async () => {
        const { repository, broker, writer } = setup();

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];
        await writer.consider(repository, candidate(5, 50));

        expect(broker.calls[0]).toMatchObject({
            kind: "performance",
            variant: "live-droid",
            request: { beatmap: { hash: testHash } },
        });
    });

    it("removes stale replays", async () => {
        const { replays, writer } = setup();

        replays.put("best", "3.odr", "old");
        await writer.removeReplays([3, 4]);

        expect(replays.files.get("best")!.size).toBe(0);
    });
});
