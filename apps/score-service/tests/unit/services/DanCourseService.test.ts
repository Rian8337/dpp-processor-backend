import type { ParsedReplay } from "@/replays/parseReplay";
import { DanCourseService } from "@/services/DanCourseService";
import { ModHidden } from "@rian8337/osu-base";
import { InMemoryDanCourseRepository } from "@test/utils/fakes";
import { testHash } from "@test/utils/rows";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mods = [new ModHidden().serialize()];
const time = new Date("2026-10-01T00:00:00Z");

function replayWith(
    score: number,
    overrides: Partial<ParsedReplay> = {},
): ParsedReplay {
    return {
        version: 4,
        hash: testHash,
        fileName: "map.osu",
        accuracy: { n300: 90, n100: 8, n50: 1, nmiss: 1 },
        rank: "S",
        hit300k: 10,
        hit100k: 2,
        v3: { score, maxCombo: 300, mods, playerName: "player", time },
        ...overrides,
    };
}

describe("DanCourseService", () => {
    let repository: InMemoryDanCourseRepository;
    let service: DanCourseService;

    beforeEach(() => {
        repository = new InMemoryDanCourseRepository();
        repository.courses = [
            { hash: testHash, requirement: { id: "score", value: 1 } },
        ];
        service = new DanCourseService(repository);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("keeps valid courses and logs each invalid document", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        repository.courses.push({ hash: 5 });
        await service.load();
        await service.submit(7, replayWith(1000));

        expect(repository.scores).toHaveLength(1);
        expect(log).toHaveBeenCalledTimes(1);
    });

    it("ignores a replay of a beatmap that is not a course", async () => {
        await service.load();
        await service.submit(7, replayWith(1000, { hash: "f".repeat(32) }));

        expect(repository.scores).toEqual([]);
    });

    it("records the first score of a course", async () => {
        await service.load();
        await service.submit(7, replayWith(1000));

        expect(repository.scores).toEqual([
            {
                uid: 7,
                username: "player",
                hash: testHash,
                mods,
                score: 1000,
                maxCombo: 300,
                rank: "S",
                geki: 10,
                perfect: 90,
                katu: 2,
                good: 8,
                bad: 1,
                miss: 1,
                date: time.getTime(),
                grade: 1000,
            },
        ]);
    });

    it("replaces an entry only with a higher grade", async () => {
        await service.load();
        await service.submit(7, replayWith(1000));
        await service.submit(7, replayWith(900));
        await service.submit(7, replayWith(1000));

        expect(repository.scores.map((s) => s.grade)).toEqual([1000]);

        await service.submit(7, replayWith(1100));

        expect(repository.scores.map((s) => s.grade)).toEqual([1100]);
    });

    it("ignores a replay without v3 data", async () => {
        await service.load();
        await service.submit(7, replayWith(1000, { v3: null }));

        expect(repository.scores).toEqual([]);
    });

    it("reloads periodically, keeps the previous courses on failure, and stops when disposed", async () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const list = vi.spyOn(repository, "listCourses");

        await service.load();

        const refresh = service.startRefreshing(1);

        repository.failList = new Error("down");
        await vi.advanceTimersByTimeAsync(60_000);

        expect(list).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(1);

        await service.submit(7, replayWith(1000));

        expect(repository.scores).toHaveLength(1);

        refresh[Symbol.dispose]();
        await vi.advanceTimersByTimeAsync(180_000);

        expect(list).toHaveBeenCalledTimes(2);
    });
});
