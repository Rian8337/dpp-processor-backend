import { dependencyTokens } from "@/dependencies/tokens";
import type { OfficialDatabase } from "@/official/connection";
import type { OfficialTables } from "@/official/schema";
import type {
    BestScoreInsert,
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
    UserTotals,
} from "@/official/types";
import { Injectable } from "@dpp/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { inject } from "tsyringe";
import type { IOfficialScoreRepository } from "./IOfficialScoreRepository";

@Injectable(dependencyTokens.officialScoreRepository)
export class OfficialScoreRepository implements IOfficialScoreRepository {
    constructor(
        @inject(dependencyTokens.officialDb)
        private readonly db: OfficialDatabase,
        @inject(dependencyTokens.officialTables)
        private readonly tables: OfficialTables,
    ) {}

    transaction<T>(
        work: (repository: IOfficialScoreRepository) => Promise<T>,
    ): Promise<T> {
        return this.db.transaction((tx) =>
            work(new OfficialScoreRepository(tx, this.tables)),
        );
    }

    async findScoreById(id: number): Promise<ScoreRow | null> {
        const { scores } = this.tables;
        const [row] = await this.db
            .select()
            .from(scores)
            .where(eq(scores.id, id))
            .limit(1);

        return row ?? null;
    }

    async findScore(uid: number, hash: string): Promise<ScoreRow | null> {
        const { scores } = this.tables;
        const [row] = await this.db
            .select()
            .from(scores)
            .where(and(eq(scores.uid, uid), eq(scores.hash, hash)))
            .limit(1);

        return row ?? null;
    }

    findBestScores(uid: number, hash: string): Promise<BestScoreRow[]> {
        const { bestScores } = this.tables;

        return this.db
            .select()
            .from(bestScores)
            .where(and(eq(bestScores.uid, uid), eq(bestScores.hash, hash)))
            .orderBy(desc(bestScores.pp), bestScores.id);
    }

    async findUncalculatedScore(
        replayFilename: string,
    ): Promise<UncalculatedScoreRow | null> {
        const { uncalculatedScores } = this.tables;
        const [row] = await this.db
            .select()
            .from(uncalculatedScores)
            .where(eq(uncalculatedScores.replayfilename, replayFilename))
            .limit(1);

        return row ?? null;
    }

    async deleteUncalculatedScore(replayFilename: string): Promise<void> {
        const { uncalculatedScores } = this.tables;

        await this.db
            .delete(uncalculatedScores)
            .where(eq(uncalculatedScores.replayfilename, replayFilename));
    }

    async findUserId(username: string): Promise<number | null> {
        const { users } = this.tables;
        const [row] = await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

        return row?.id ?? null;
    }

    async findUserLastLogin(
        uid: number,
    ): Promise<{ lastLoginTime: Date | null } | null> {
        const { users } = this.tables;
        const [row] = await this.db
            .select({ lastLoginTime: users.lastLoginTime })
            .from(users)
            .where(eq(users.id, uid))
            .limit(1);

        return row ?? null;
    }

    async lockUser(uid: number): Promise<void> {
        const { users } = this.tables;

        await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, uid))
            .for("update");
    }

    async setScorePP(id: number, pp: number | null): Promise<void> {
        const { scores } = this.tables;

        await this.db.update(scores).set({ pp }).where(eq(scores.id, id));
    }

    async setBestScorePP(id: number, pp: number): Promise<void> {
        const { bestScores } = this.tables;

        await this.db
            .update(bestScores)
            .set({ pp })
            .where(eq(bestScores.id, id));
    }

    async deleteBestScores(
        uid: number,
        hash: string,
        keepId?: number,
    ): Promise<number[]> {
        const { bestScores } = this.tables;
        const condition = and(
            eq(bestScores.uid, uid),
            eq(bestScores.hash, hash),
            keepId === undefined ? undefined : ne(bestScores.id, keepId),
        );
        const rows = await this.db
            .select({ id: bestScores.id })
            .from(bestScores)
            .where(condition);

        if (rows.length > 0) {
            await this.db.delete(bestScores).where(condition);
        }

        return rows.map((row) => row.id);
    }

    async insertBestScore(row: BestScoreInsert): Promise<void> {
        await this.db.insert(this.tables.bestScores).values(row);
    }

    topBestScores(
        uid: number,
        limit: number,
    ): Promise<{ pp: number; accuracy: number }[]> {
        const { bestScores } = this.tables;

        return this.db
            .select({
                pp: bestScores.pp,
                // Nullable in production; a missing accuracy counts as 0.
                accuracy: sql<number>`coalesce(${bestScores.accuracy}, 0)`,
            })
            .from(bestScores)
            .where(eq(bestScores.uid, uid))
            .orderBy(desc(bestScores.pp))
            .limit(limit);
    }

    async setUserTotals(uid: number, totals: UserTotals): Promise<void> {
        const { users } = this.tables;

        await this.db
            .update(users)
            .set({ pp: totals.pp, accuracy: totals.accuracy })
            .where(eq(users.id, uid));
    }
}
