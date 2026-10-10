import type { DanCourseScore } from "@/mongo/documents";

export interface IDanCourseRepository {
    /**
     * Raw course documents; the caller validates them.
     */
    listCourses(): Promise<unknown[]>;
    /**
     * The grade of the player's leaderboard entry, or null if none (or unreadable).
     */
    findGrade(uid: number, hash: string): Promise<number | null>;
    upsertScore(score: DanCourseScore): Promise<void>;
}
