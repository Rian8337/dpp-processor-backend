import type { ParsedReplay, ReplayParser } from "@/replays/parseReplay";
import { DanCourseService } from "@/services/DanCourseService";
import { ReplaySubmissionService } from "@/services/ReplaySubmissionService";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { ModHidden } from "@rian8337/osu-base";
import { replayPerformanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    beatmapNotFound,
    FakeBeatmapServiceClient,
    FakeBrokerClient,
    FakeDiscordMetadataClient,
    InMemoryDanCourseRepository,
    InMemoryOfficialScoreRepository,
    InMemoryRecentPlayRepository,
    InMemoryUserBindRepository,
    retryLater,
} from "@test/utils/fakes";
import { testHash } from "@test/utils/rows";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mods = [new ModHidden().serialize()];
const hits = { n300: 100, n100: 2, n50: 1, nmiss: 0 };
const file = Buffer.from("replay");

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

const score = {
    ...hits,
    combo: 150,
    tapPenalty: 1,
    sliderCheesePenalty: 1,
};
const droidBody = replayPerformanceBody(0, {
    difficulty: { mods, starRating: 5 },
    performance: {
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
    },
    score,
});
const osuBody = replayPerformanceBody(0, {
    difficulty: { mods, starRating: 4 },
    performance: { total: 90, aim: 40, speed: 30, accuracy: 15, flashlight: 0 },
    score,
});

describe("ReplaySubmissionService", () => {
    let official: InMemoryOfficialScoreRepository;
    let broker: FakeBrokerClient;
    let beatmaps: FakeBeatmapServiceClient;
    let recentPlays: InMemoryRecentPlayRepository;
    let binds: InMemoryUserBindRepository;
    let danRepository: InMemoryDanCourseRepository;
    let discord: FakeDiscordMetadataClient;
    let parsed: ParsedReplay | null;
    let service: ReplaySubmissionService;

    beforeEach(async () => {
        official = new InMemoryOfficialScoreRepository();
        official.users.push({
            id: 7,
            username: "player",
            pp: 0,
            accuracy: 1,
            lastLoginTime: null,
        });
        broker = new FakeBrokerClient(undefined, (variant) => ({
            ok: true,
            value: variant === "live-droid" ? droidBody : osuBody,
        }));
        beatmaps = new FakeBeatmapServiceClient();
        recentPlays = new InMemoryRecentPlayRepository();
        binds = new InMemoryUserBindRepository();
        binds.binds.set(7, "discord-7");
        danRepository = new InMemoryDanCourseRepository();
        discord = new FakeDiscordMetadataClient();
        parsed = replay;

        const danCourses = new DanCourseService(danRepository);

        await danCourses.load();

        const parse: ReplayParser = () => Promise.resolve(parsed);

        service = new ReplaySubmissionService(
            official,
            new ScoreCalculator(broker),
            beatmaps,
            recentPlays,
            binds,
            danCourses,
            discord,
            parse,
            testConfig,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("stores a recent play and updates Discord", async () => {
        const result = await service.process("99_abc.odr", file);

        expect(result).toEqual({ action: "delete", reason: "processed" });
        expect(recentPlays.plays).toHaveLength(1);
        expect(recentPlays.plays[0]).toMatchObject({
            uid: 7,
            scoreId: 99,
            title: "Artist - Title (Mapper) [Hard]",
        });
        expect(recentPlays.plays[0]).toHaveProperty("droidAttribs");
        expect(recentPlays.plays[0]).toHaveProperty("osuAttribs");
        expect(discord.updates).toEqual(["discord-7"]);
        expect(beatmaps.calls).toEqual([{ lane: "priority", hash: testHash }]);
    });

    it.each(["abc.odr", "1_2_3.odr"])("gives %s score ID 0", async (name) => {
        await service.process(name, file);

        expect(recentPlays.plays[0]!.scoreId).toBe(0);
    });

    it("deletes an unreadable or pre-v3 replay", async () => {
        const expected = {
            action: "delete",
            reason: "unreadable or older than v3",
        };

        parsed = null;
        expect(await service.process("99_a.odr", file)).toEqual(expected);

        parsed = { ...replay, v3: null };
        expect(await service.process("99_a.odr", file)).toEqual(expected);
        expect(recentPlays.plays).toEqual([]);
    });

    it("deletes a replay of an unknown player", async () => {
        official.users.length = 0;

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "delete",
            reason: "unknown player",
        });
    });

    it("leaves out droid attributes when the droid calculation is rejected", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        broker.onReplay = (variant) =>
            variant === "live-droid"
                ? beatmapNotFound
                : { ok: true, value: osuBody };

        const result = await service.process("99_a.odr", file);

        expect(result.action).toBe("delete");
        expect(recentPlays.plays[0]).not.toHaveProperty("droidAttribs");
        expect(recentPlays.plays[0]).toHaveProperty("osuAttribs");
    });

    it("titles the play after the replay's file when the beatmap is unknown", async () => {
        beatmaps.answer = () => ({ ok: true, value: null });

        await service.process("99_a.odr", file);

        expect(recentPlays.plays[0]!.title).toBe(
            "Artist - Title (Mapper) [Hard]",
        );
    });

    it("still processes the dan course for a player without a bind", async () => {
        danRepository.courses = [
            { hash: testHash, requirement: { id: "score", value: 1 } },
        ];
        binds.binds.clear();
        await rebuildWithCourses();

        const result = await service.process("99_a.odr", file);

        expect(result.action).toBe("delete");
        expect(recentPlays.plays).toEqual([]);
        expect(discord.updates).toEqual([]);
        expect(danRepository.scores).toHaveLength(1);
    });

    it("deletes even when the Discord update is rejected", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        discord.accept = false;

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "delete",
            reason: "processed",
        });
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("Discord metadata update failed"),
        );
    });

    it("keeps the replay when the broker asks to retry", async () => {
        broker.onReplay = () => retryLater;

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "keep",
            reason: "busy",
        });
        expect(recentPlays.plays).toEqual([]);

        broker.onReplay = () => ({ ...retryLater, retryAfterMs: 5000 });

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "keep",
            reason: "busy",
            retryAfterMs: 5000,
        });
    });

    it("keeps the replay when the beatmap service asks to retry", async () => {
        beatmaps.answer = () => retryLater;

        const result = await service.process("99_a.odr", file);

        expect(result.action).toBe("keep");
        expect(recentPlays.plays).toEqual([]);
    });

    it("keeps the replay when a database fails", async () => {
        official.findUserId = () => Promise.reject(new Error("db down"));

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "keep",
            reason: "db down",
        });

        official = new InMemoryOfficialScoreRepository();
        official.users.push({
            id: 7,
            username: "player",
            pp: 0,
            accuracy: 1,
            lastLoginTime: null,
        });
        recentPlays.fail = new Error("mongo down");
        await rebuild();

        expect(await service.process("99_a.odr", file)).toEqual({
            action: "keep",
            reason: "mongo down",
        });
    });

    it("submits the dan course before inserting the recent play", async () => {
        await rebuildWithCourses();
        recentPlays.fail = new Error("mongo down");

        const result = await service.process("99_a.odr", file);

        expect(result.action).toBe("keep");
        expect(danRepository.scores).toHaveLength(1);
        expect(recentPlays.plays).toEqual([]);
    });

    async function rebuildWithCourses() {
        danRepository.courses = [
            { hash: testHash, requirement: { id: "score", value: 1 } },
        ];
        await rebuild();
    }

    async function rebuild() {
        const danCourses = new DanCourseService(danRepository);

        await danCourses.load();
        service = new ReplaySubmissionService(
            official,
            new ScoreCalculator(broker),
            beatmaps,
            recentPlays,
            binds,
            danCourses,
            discord,
            () => Promise.resolve(parsed),
            testConfig,
        );
    }
});
