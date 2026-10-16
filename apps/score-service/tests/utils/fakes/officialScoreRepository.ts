import type {
    BestScoreInsert,
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
    UserTotals,
} from "@/official/types";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import { bestScoreRow } from "@test/utils/rows";

/**
 * The official repository in memory. `transaction` restores every table if the work throws.
 */
export class InMemoryOfficialScoreRepository implements IOfficialScoreRepository {
    scores: ScoreRow[] = [];
    bestScores: BestScoreRow[] = [];
    uncalculatedScores: UncalculatedScoreRow[] = [];
    users: {
        id: number;
        username: string;
        pp: number;
        accuracy: number;
        lastLoginTime: Date | null;
    }[] = [];
    readonly lockedUsers: number[] = [];

    async transaction<T>(
        work: (repository: IOfficialScoreRepository) => Promise<T>,
    ): Promise<T> {
        const snapshot = structuredClone({
            scores: this.scores,
            bestScores: this.bestScores,
            uncalculatedScores: this.uncalculatedScores,
            users: this.users,
        });

        try {
            return await work(this);
        } catch (e) {
            Object.assign(this, snapshot);
            throw e;
        }
    }

    findScoreById(id: number) {
        return Promise.resolve(this.scores.find((s) => s.id === id) ?? null);
    }

    findScore(uid: number, hash: string) {
        return Promise.resolve(
            this.scores.find((s) => s.uid === uid && s.hash === hash) ?? null,
        );
    }

    findBestScores(uid: number, hash: string) {
        return Promise.resolve(
            this.bestScores
                .filter((s) => s.uid === uid && s.hash === hash)
                .sort((a, b) => b.pp - a.pp || a.id - b.id),
        );
    }

    findUncalculatedScore(replayFilename: string) {
        return Promise.resolve(
            this.uncalculatedScores.find(
                (s) => s.replayfilename === replayFilename,
            ) ?? null,
        );
    }

    deleteUncalculatedScore(replayFilename: string) {
        this.uncalculatedScores = this.uncalculatedScores.filter(
            (s) => s.replayfilename !== replayFilename,
        );
        return Promise.resolve();
    }

    findUserId(username: string) {
        return Promise.resolve(
            this.users.find((u) => u.username === username)?.id ?? null,
        );
    }

    findUserLastLogin(uid: number) {
        const user = this.users.find((u) => u.id === uid);
        return Promise.resolve(
            user ? { lastLoginTime: user.lastLoginTime } : null,
        );
    }

    lockUser(uid: number) {
        this.lockedUsers.push(uid);
        return Promise.resolve();
    }

    setScorePP(id: number, pp: number | null) {
        for (const score of this.scores.filter((s) => s.id === id)) {
            score.pp = pp;
        }
        return Promise.resolve();
    }

    setBestScorePP(id: number, pp: number) {
        for (const score of this.bestScores.filter((s) => s.id === id)) {
            score.pp = pp;
        }
        return Promise.resolve();
    }

    deleteBestScores(uid: number, hash: string, keepId?: number) {
        const deleted = this.bestScores.filter(
            (s) => s.uid === uid && s.hash === hash && s.id !== keepId,
        );
        this.bestScores = this.bestScores.filter((s) => !deleted.includes(s));
        return Promise.resolve(deleted.map((s) => s.id));
    }

    insertBestScore(row: BestScoreInsert) {
        // `id` is the table's primary key in production.
        if (this.bestScores.some((s) => s.id === row.id)) {
            return Promise.reject(
                new Error(`Duplicate best score ID ${String(row.id)}`),
            );
        }

        this.bestScores.push(bestScoreRow(row));
        return Promise.resolve();
    }

    topBestScores(uid: number, limit: number) {
        return Promise.resolve(
            this.bestScores
                .filter((s) => s.uid === uid)
                .sort((a, b) => b.pp - a.pp)
                .slice(0, limit)
                .map(({ pp, accuracy }) => ({ pp, accuracy: accuracy ?? 0 })),
        );
    }

    setUserTotals(uid: number, totals: UserTotals) {
        const user = this.users.find((u) => u.id === uid);
        if (user) {
            user.pp = totals.pp;
            user.accuracy = totals.accuracy;
        }
        return Promise.resolve();
    }
}
