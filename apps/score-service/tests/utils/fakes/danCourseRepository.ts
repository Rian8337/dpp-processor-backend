import type { DanCourseScore } from "@/mongo/documents";
import type { IDanCourseRepository } from "@/repositories/IDanCourseRepository";

export class InMemoryDanCourseRepository implements IDanCourseRepository {
    courses: unknown[] = [];
    readonly scores: DanCourseScore[] = [];
    failList: Error | null = null;

    listCourses() {
        if (this.failList) {
            return Promise.reject(this.failList);
        }

        return Promise.resolve(this.courses);
    }

    findGrade(uid: number, hash: string) {
        return Promise.resolve(
            this.scores.find((s) => s.uid === uid && s.hash === hash)?.grade ??
                null,
        );
    }

    upsertScore(score: DanCourseScore) {
        const index = this.scores.findIndex(
            (s) => s.uid === score.uid && s.hash === score.hash,
        );

        if (index === -1) {
            this.scores.push(score);
        } else {
            this.scores[index] = score;
        }

        return Promise.resolve();
    }
}
