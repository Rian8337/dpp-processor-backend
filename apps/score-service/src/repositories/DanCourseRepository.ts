import { dependencyTokens } from "@/dependencies/tokens";
import { danCourseGradeSchema, type DanCourseScore } from "@/mongo/documents";
import { Injectable } from "@dpp/server";
import type { Collection, Db, Document } from "mongodb";
import { inject } from "tsyringe";
import type { IDanCourseRepository } from "./IDanCourseRepository";

@Injectable(dependencyTokens.danCourseRepository)
export class DanCourseRepository implements IDanCourseRepository {
    // Read only, and validated by the caller: typing it would promise a shape nothing has checked.
    private readonly courses: Collection<Document>;
    private readonly leaderboard: Collection<DanCourseScore>;

    constructor(@inject(dependencyTokens.aliceDb) db: Db) {
        this.courses = db.collection("dancoursemaps");
        this.leaderboard = db.collection("dancourseleaderboard");
    }

    listCourses(): Promise<unknown[]> {
        return this.courses.find({}, { projection: { _id: 0 } }).toArray();
    }

    async findGrade(uid: number, hash: string): Promise<number | null> {
        const document = await this.leaderboard.findOne(
            { uid, hash },
            { projection: { _id: 0, grade: 1 } },
        );
        const parsed = danCourseGradeSchema.safeParse(document);

        return parsed.success ? parsed.data.grade : null;
    }

    async upsertScore(score: DanCourseScore): Promise<void> {
        await this.leaderboard.updateOne(
            { uid: score.uid, hash: score.hash },
            { $set: score },
            { upsert: true },
        );
    }
}
