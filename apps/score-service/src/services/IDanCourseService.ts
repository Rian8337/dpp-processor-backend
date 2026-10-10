import type { ParsedReplay } from "@/replays/parseReplay";

export interface IDanCourseService {
    /** Replaces the loaded courses; invalid documents are skipped with a log line. */
    load(): Promise<void>;
    /** Reloads every `minutes`; failures are logged and the previous courses kept. */
    startRefreshing(minutes: number): Disposable;
    /** Records a v3 replay on its course's leaderboard if it is a course and the grade improves. */
    submit(uid: number, replay: ParsedReplay): Promise<void>;
}
