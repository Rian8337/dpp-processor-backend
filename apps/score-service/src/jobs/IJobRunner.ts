import type { JobDefinition } from "@/repositories/IJobProgressRepository";

export interface JobRunOptions {
    readonly job: JobDefinition;
    readonly concurrency: number;
    readonly signal: AbortSignal;
    /** Processes one ID. Throwing (any error) retries the same ID with backoff. */
    readonly process: (id: number) => Promise<void>;
}

export type JobRunResult = "finished" | "interrupted";

export interface IJobRunner {
    /** @throws {JobConflictError} */
    run(options: JobRunOptions): Promise<JobRunResult>;
}
