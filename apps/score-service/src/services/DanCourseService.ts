import { dependencyTokens } from "@/dependencies/tokens";
import {
    danCourseSchema,
    type DanCourse,
    type DanCourseScore,
} from "@/mongo/documents";
import type { ParsedReplay } from "@/replays/parseReplay";
import type { IDanCourseRepository } from "@/repositories/IDanCourseRepository";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import { danCourseGrade } from "./danCourseGrade";
import type { IDanCourseService } from "./IDanCourseService";

@Injectable(dependencyTokens.danCourseService)
export class DanCourseService implements IDanCourseService {
    private courses = new Map<string, DanCourse>();

    constructor(
        @inject(dependencyTokens.danCourseRepository)
        private readonly repository: IDanCourseRepository,
    ) {}

    async load(): Promise<void> {
        const courses = new Map<string, DanCourse>();

        for (const document of await this.repository.listCourses()) {
            const parsed = danCourseSchema.safeParse(document);

            if (parsed.success) {
                courses.set(parsed.data.hash, parsed.data);
            } else {
                console.log("Skipping an invalid dan course document");
            }
        }

        this.courses = courses;
    }

    startRefreshing(minutes: number): Disposable {
        const timer = setInterval(() => {
            this.load().catch((e: unknown) => {
                console.error(
                    "Failed to reload dan courses; keeping the previous ones:",
                    e,
                );
            });
        }, minutes * 60_000);

        timer.unref();

        return { [Symbol.dispose]: () => clearInterval(timer) };
    }

    async submit(uid: number, replay: ParsedReplay): Promise<void> {
        const course = this.courses.get(replay.hash);

        if (!course || !replay.v3) {
            return;
        }

        const { v3 } = replay;
        const score: DanCourseScore = {
            uid,
            username: v3.playerName,
            hash: replay.hash,
            mods: v3.mods,
            score: v3.score,
            maxCombo: v3.maxCombo,
            rank: replay.rank,
            geki: replay.hit300k,
            perfect: replay.accuracy.n300,
            katu: replay.hit100k,
            good: replay.accuracy.n100,
            bad: replay.accuracy.n50,
            miss: replay.accuracy.nmiss,
            date: v3.time.getTime(),
            grade: 0,
        };

        score.grade = danCourseGrade(course.requirement.id, score);

        const existing = await this.repository.findGrade(uid, replay.hash);

        if (existing === null || score.grade > existing) {
            await this.repository.upsertScore(score);
        }
    }
}
