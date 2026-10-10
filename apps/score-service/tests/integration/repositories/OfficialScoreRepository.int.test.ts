import { ModHidden } from "@rian8337/osu-base";
import {
    scoreColumns,
    type BestScoreRow,
    type ScoreRow,
} from "@/official/types";
import { OfficialScoreRepository } from "@/repositories/OfficialScoreRepository";
import {
    hasMariaDb,
    startTestMariaDb,
    type TestMariaDb,
} from "@test/utils/mariadb";
import {
    createOfficialTestDatabase,
    type OfficialTestDatabase,
} from "@test/utils/officialDatabase";
import {
    bestScoreRow,
    scoreRow,
    testHash,
    uncalculatedRow,
} from "@test/utils/rows";
import { eq } from "drizzle-orm";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";

/**
 * A best row as the service inserts it: without the generated total score.
 */
function bestInsert(row: BestScoreRow) {
    return {
        ...scoreColumns(row),
        filename: row.filename,
        pp: row.pp,
        ppMultiplier: row.ppMultiplier,
    };
}

/**
 * A score row without the generated total score.
 */
function scoreInsert(row: ScoreRow) {
    const { totalScore: _generated, ...columns } = row;

    return columns;
}

describe.skipIf(!(await hasMariaDb()))(
    "OfficialScoreRepository (MariaDB)",
    () => {
        let server: TestMariaDb;
        let database: OfficialTestDatabase;
        let repository: OfficialScoreRepository;

        beforeAll(async () => {
            server = await startTestMariaDb();
        }, 60_000);

        afterAll(async () => {
            await server[Symbol.asyncDispose]();
        });

        beforeEach(async () => {
            database = await createOfficialTestDatabase(server.settings);
            repository = new OfficialScoreRepository(
                database.connection.db,
                database.connection.tables,
            );

            const { db, tables } = database.connection;

            await db.insert(tables.users).values([
                {
                    id: 7,
                    username: "player",
                    lastLoginTime: new Date("2026-09-01T00:00:00Z"),
                },
                { id: 8, username: "other" },
            ]);
        });

        afterEach(async () => {
            await database[Symbol.asyncDispose]();
        });

        it("reads scores with mods as a string and the generated total score", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.scores).values(
                scoreInsert(
                    scoreRow({
                        id: 10,
                        mods: JSON.stringify([new ModHidden().serialize()]),
                        score: 1000,
                        scoreMultiplier: 1.5,
                    }),
                ),
            );

            expect(await repository.findScoreById(10)).toMatchObject({
                id: 10,
                mods: JSON.stringify([new ModHidden().serialize()]),
                ppMultiplier: 1,
                totalScore: 1500,
            });
            expect(await repository.findScore(7, testHash)).toMatchObject({
                id: 10,
            });
            expect(await repository.findScore(8, testHash)).toBeNull();
            expect(await repository.findScoreById(11)).toBeNull();
        });

        it("reads null hit counts as null", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.scores).values({
                ...scoreInsert(scoreRow({ id: 10 })),
                combo: null,
                miss: null,
            });

            expect(await repository.findScoreById(10)).toMatchObject({
                combo: null,
                miss: null,
            });
        });

        it("lists best rows highest pp first and deletes all but one", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.bestScores)
                .values([
                    bestInsert(bestScoreRow({ id: 1, pp: 50 })),
                    bestInsert(bestScoreRow({ id: 2, pp: 80 })),
                    bestInsert(bestScoreRow({ id: 3, pp: 60 })),
                ]);

            expect(
                (await repository.findBestScores(7, testHash)).map((r) => r.id),
            ).toEqual([2, 3, 1]);
            expect(
                (await repository.deleteBestScores(7, testHash, 2)).sort(
                    (a, b) => a - b,
                ),
            ).toEqual([1, 3]);
            expect(
                (await repository.findBestScores(7, testHash)).map((r) => r.id),
            ).toEqual([2]);
            expect(await repository.deleteBestScores(7, testHash)).toEqual([2]);
            expect(await repository.deleteBestScores(7, testHash)).toEqual([]);
        });

        it("inserts a best row without writing the generated total score", async () => {
            await repository.insertBestScore(
                bestInsert(
                    bestScoreRow({
                        id: 5,
                        pp: 10,
                        score: 1000,
                        scoreMultiplier: 1.5,
                    }),
                ),
            );
            await repository.setBestScorePP(5, 20);

            expect(
                (await repository.findBestScores(7, testHash))[0],
            ).toMatchObject({ id: 5, pp: 20, totalScore: 1500 });
        });

        it("sets and clears a score's pp", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.scores)
                .values(scoreInsert(scoreRow({ id: 10 })));
            await repository.setScorePP(10, null);

            expect((await repository.findScoreById(10))?.pp).toBeNull();
        });

        it("finds and deletes uncalculated rows by replay file name", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.uncalculatedScores)
                .values(uncalculatedRow({ replayfilename: "a.odr" }));

            expect(
                await repository.findUncalculatedScore("a.odr"),
            ).toMatchObject({
                uid: 7,
            });
            await repository.deleteUncalculatedScore("a.odr");
            expect(await repository.findUncalculatedScore("a.odr")).toBeNull();
        });

        it("finds users and writes totals", async () => {
            expect(await repository.findUserId("player")).toBe(7);
            expect(await repository.findUserId("nobody")).toBeNull();
            expect(await repository.findUserLastLogin(7)).toEqual({
                lastLoginTime: new Date("2026-09-01T00:00:00Z"),
            });

            await repository.setUserTotals(7, { pp: 123.5, accuracy: 0.9 });

            const { db, tables } = database.connection;
            const [user] = await db
                .select()
                .from(tables.users)
                .where(eq(tables.users.id, 7));

            expect(user?.pp).toBeCloseTo(123.5, 3);
        });

        it("reads top best scores, a null accuracy as 0", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.bestScores).values([
                bestInsert(
                    bestScoreRow({ id: 1, pp: 50, hash: "a".repeat(32) }),
                ),
                {
                    ...bestInsert(
                        bestScoreRow({ id: 2, pp: 80, hash: "b".repeat(32) }),
                    ),
                    accuracy: null,
                },
            ]);

            expect(await repository.topBestScores(7, 1)).toEqual([
                { pp: 80, accuracy: 0 },
            ]);
        });

        it("rolls a transaction back on error", async () => {
            await expect(
                repository.transaction(async (tx) => {
                    await tx.insertBestScore(
                        bestInsert(bestScoreRow({ id: 9 })),
                    );
                    throw new Error("boom");
                }),
            ).rejects.toThrow("boom");

            expect(await repository.findBestScores(7, testHash)).toEqual([]);
        });

        it("makes a second transaction wait for a user lock", async () => {
            const order: string[] = [];
            let releaseFirst!: () => void;
            const firstHolds = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let firstLocked!: () => void;
            const locked = new Promise<void>((resolve) => {
                firstLocked = resolve;
            });

            const first = repository.transaction(async (tx) => {
                await tx.lockUser(7);
                firstLocked();
                await firstHolds;
                order.push("first commits");
            });

            await locked;

            const second = repository.transaction(async (tx) => {
                await tx.lockUser(7);
                order.push("second locked");
            });

            // Give the second transaction time to block on the lock.
            await new Promise((resolve) => setTimeout(resolve, 300));
            releaseFirst();
            await Promise.all([first, second]);

            expect(order).toEqual(["first commits", "second locked"]);
        });
    },
);
