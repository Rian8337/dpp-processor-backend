import { OfficialDb } from "@/database/official";
import {
    bestScores,
    IBestScore,
    IScore,
    scores,
} from "@/database/official/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    validateMD5Hash,
    validateScoreId,
    validateUserId,
} from "@/utils/validators";
import { and, desc, eq, gt } from "drizzle-orm";
import { SelectedFields } from "drizzle-orm/mysql-core";
import { inject } from "tsyringe";
import { BaseOfficialRepository } from "./BaseOfficialRepository";
import { IScoreRepository } from "./IScoreRepository";

/**
 * Provides operations for interacting with scores in the official database.
 */
@Repository(dependencyTokens.scoreRepository)
export class ScoreRepository
    extends BaseOfficialRepository
    implements IScoreRepository
{
    constructor(@inject(dependencyTokens.officialDb) db: OfficialDb) {
        super(db);
    }

    async getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | null> {
        validateUserId(uid);
        validateMD5Hash(hash);

        const selectedColumns: SelectedFields = {};

        for (const column of columns) {
            selectedColumns[column] = scores[column];
        }

        const select =
            columns.length > 0
                ? this.db.select(selectedColumns)
                : this.db.select();

        return select
            .from(scores)
            .where(
                and(
                    eq(scores.uid, uid),
                    eq(scores.hash, hash),
                    gt(scores.score, 0),
                ),
            )
            .limit(1)
            .then((res) => (res.at(0) ?? null) as Pick<IScore, K> | null);
    }

    async getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | null> {
        validateUserId(uid);
        validateMD5Hash(hash);

        const selectedColumns: SelectedFields = {};

        for (const column of columns) {
            selectedColumns[column] = bestScores[column];
        }

        const select =
            columns.length > 0
                ? this.db.select(selectedColumns)
                : this.db.select();

        return select
            .from(bestScores)
            .where(and(eq(bestScores.uid, uid), eq(bestScores.hash, hash)))
            .limit(1)
            .then((res) => (res.at(0) ?? null) as Pick<IBestScore, K> | null);
    }

    async getUserTopScores<K extends keyof IBestScore>(
        uid: number,
        limit = 100,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K>[]> {
        validateUserId(uid);

        if (!Number.isInteger(limit)) {
            throw new TypeError("Limit must be an integer.");
        }

        if (limit < 1) {
            throw new RangeError("Limit must be a positive integer.");
        }

        const selectedColumns: SelectedFields = {};

        for (const column of columns) {
            selectedColumns[column] = bestScores[column];
        }

        const select =
            columns.length > 0
                ? this.db.select(selectedColumns)
                : this.db.select();

        return select
            .from(bestScores)
            .where(eq(bestScores.uid, uid))
            .orderBy(desc(bestScores.pp))
            .limit(limit)
            .then((res) => res as Pick<IBestScore, K>[]);
    }

    async updateScorePPValue(id: number, pp: number | null): Promise<boolean> {
        validateScoreId(id);

        if (pp !== null && pp < 0) {
            throw new RangeError("PP value must be a non-negative number.");
        }

        return this.db
            .update(scores)
            .set({ pp })
            .where(eq(scores.id, id))
            .then((res) => res[0].affectedRows === 1);
    }

    async updateBestScorePPValue(id: number, pp: number): Promise<boolean> {
        validateScoreId(id);

        if (pp < 0) {
            throw new RangeError("PP value must be a non-negative number.");
        }

        return this.db
            .update(bestScores)
            .set({ pp })
            .where(eq(bestScores.id, id))
            .then((res) => res[0].affectedRows === 1);
    }

    async insertBestScore(score: IBestScore): Promise<boolean> {
        return this.db
            .insert(bestScores)
            .values(score)
            .onDuplicateKeyUpdate({
                set: {
                    ...score,
                    id: undefined,
                    uid: undefined,
                },
            })
            .then((res) => res[0].affectedRows === 1);
    }

    async invalidatePPValue(id: number) {
        await this.db.transaction(async (tx) => {
            await tx.update(scores).set({ pp: null }).where(eq(scores.id, id));

            await tx
                .update(bestScores)
                .set({ pp: 0 })
                .where(eq(bestScores.id, id));
        });
    }
}
