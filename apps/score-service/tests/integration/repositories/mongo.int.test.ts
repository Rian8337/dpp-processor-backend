import { MongoConnections } from "@/mongo/connections";
import type { DanCourseScore, RecentPlayDocument } from "@/mongo/documents";
import { DanCourseRepository } from "@/repositories/DanCourseRepository";
import { RecentPlayRepository } from "@/repositories/RecentPlayRepository";
import { UserBindRepository } from "@/repositories/UserBindRepository";
import { ModHidden, ModNoFail } from "@rian8337/osu-base";
import { MongoClient, type Db } from "mongodb";
import { startTestMongo, type TestMongo } from "@test/utils/mongo";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

describe("MongoDB repositories", () => {
    let mongo: TestMongo;
    let client: MongoClient;
    let aliceDb: Db;
    let elainaDb: Db;

    beforeAll(async () => {
        mongo = await startTestMongo();
        client = await MongoClient.connect(mongo.uri);
        aliceDb = client.db("AliceDB");
        elainaDb = client.db("ElainaDB");
    }, 120_000);

    afterAll(async () => {
        await client?.close();
        await mongo?.[Symbol.asyncDispose]();
    });

    beforeEach(async () => {
        await aliceDb.dropDatabase();
        await elainaDb.dropDatabase();
    });

    describe("RecentPlayRepository", () => {
        it("stores the document unchanged and leaves the caller's object alone", async () => {
            const play: RecentPlayDocument = {
                uid: 1,
                title: "Artist - Title [Diff]",
                combo: 100,
                score: 123456,
                rank: "S",
                date: new Date("2026-01-02T03:04:05.000Z"),
                accuracy: { n300: 90, n100: 5, n50: 1, nmiss: 2 },
                mods: [new ModHidden().serialize()],
                hash: "0123456789abcdef0123456789abcdef",
                scoreId: 42,
            };

            await new RecentPlayRepository(aliceDb).insert(play);

            const stored = await aliceDb
                .collection("recentplays")
                .find({}, { projection: { _id: 0 } })
                .toArray();

            expect(stored).toEqual([play]);
            expect(play).not.toHaveProperty("_id");
        });
    });

    describe("DanCourseRepository", () => {
        const score = (overrides: Partial<DanCourseScore>): DanCourseScore => ({
            uid: 1,
            username: "player",
            hash: "abc",
            mods: [new ModNoFail().serialize()],
            score: 1000,
            maxCombo: 50,
            rank: "A",
            geki: 1,
            perfect: 2,
            katu: 3,
            good: 4,
            bad: 5,
            miss: 6,
            date: 1700000000000,
            grade: 3,
            ...overrides,
        });

        it("lists courses without _id", async () => {
            const course = {
                hash: "abc",
                requirement: { id: "acc", value: 95 },
            };
            await aliceDb.collection("dancoursemaps").insertOne({ ...course });

            expect(
                await new DanCourseRepository(aliceDb).listCourses(),
            ).toEqual([course]);
        });

        it("finds the grade only after a score was stored", async () => {
            const repository = new DanCourseRepository(aliceDb);

            expect(await repository.findGrade(1, "abc")).toBeNull();

            await repository.upsertScore(score({ grade: 4 }));

            expect(await repository.findGrade(1, "abc")).toBe(4);
            expect(await repository.findGrade(2, "abc")).toBeNull();
        });

        it("keeps one document per player and course", async () => {
            const repository = new DanCourseRepository(aliceDb);
            const second = score({ score: 2000, grade: 5 });

            await repository.upsertScore(score({}));
            await repository.upsertScore(second);

            const stored = await aliceDb
                .collection("dancourseleaderboard")
                .find({}, { projection: { _id: 0 } })
                .toArray();

            expect(stored).toEqual([second]);
        });

        it("treats an unreadable entry as having no grade", async () => {
            await aliceDb
                .collection("dancourseleaderboard")
                .insertOne({ uid: 1, hash: "abc", grade: "x" });

            expect(
                await new DanCourseRepository(aliceDb).findGrade(1, "abc"),
            ).toBeNull();
        });
    });

    describe("UserBindRepository", () => {
        it("finds the Discord ID by any previously bound uid", async () => {
            await elainaDb
                .collection("userbind")
                .insertOne({ discordid: "1", previous_bind: [5, 6] });
            const repository = new UserBindRepository(elainaDb);

            expect(await repository.findDiscordId(6)).toBe("1");
            expect(await repository.findDiscordId(7)).toBeNull();
        });

        it("ignores a document with a non-string Discord ID", async () => {
            await elainaDb
                .collection("userbind")
                .insertOne({ discordid: 5, previous_bind: [8] });

            expect(
                await new UserBindRepository(elainaDb).findDiscordId(8),
            ).toBeNull();
        });
    });

    describe("MongoConnections", () => {
        it("connects to both databases and closes both clients", async () => {
            const connections = await MongoConnections.connect({
                aliceUri: mongo.uri,
                elainaUri: mongo.uri,
            });

            expect(connections.aliceDb.databaseName).toBe("AliceDB");
            expect(connections.elainaDb.databaseName).toBe("ElainaDB");
            await connections.aliceDb.command({ ping: 1 });

            await connections[Symbol.asyncDispose]();

            await expect(
                connections.aliceDb.command({ ping: 1 }),
            ).rejects.toThrow(/./);
            await expect(
                connections.elainaDb.command({ ping: 1 }),
            ).rejects.toThrow(/./);
        });

        it("rejects and closes the first client when the second cluster is unreachable", async () => {
            const close = vi.spyOn(MongoClient.prototype, "close");

            await expect(
                MongoConnections.connect({
                    aliceUri: mongo.uri,
                    elainaUri:
                        "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=500",
                }),
            ).rejects.toThrow(/ECONNREFUSED/);
            expect(close).toHaveBeenCalledTimes(1);
        });
    });
});
