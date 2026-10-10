export type JobKind = "scores" | "total-pp";

export interface JobDefinition {
    readonly name: string;
    readonly kind: JobKind;
    readonly from: number;
    readonly to: number;
    readonly chunkSize: number;
}

export interface ClaimedChunk {
    readonly start: number;
    readonly end: number;
    /** The last ID processed in an earlier run, or null. Work resumes after it. */
    readonly lastProcessedId: number | null;
}

export interface JobStatus {
    readonly job: JobDefinition;
    readonly chunks: {
        readonly done: number;
        readonly inProgress: number;
        readonly pending: number;
    };
    /** Chunks in progress, with the worker that last held each and the last ID it processed. */
    readonly active: readonly {
        readonly start: number;
        readonly end: number;
        readonly worker: number | null;
        readonly lastProcessedId: number | null;
    }[];
}

/**
 * A job with this name exists with a different kind, range, or chunk size.
 */
export class JobConflictError extends Error {
    // Not `name`: that would read like `Error.name`, which is set below.
    constructor(jobName: string) {
        super(
            `A job named ${jobName} already exists with a different kind, range, or chunk size`,
        );
        this.name = "JobConflictError";
    }
}

export interface IJobProgressRepository {
    /** Creates the job and its chunks, or returns false if an identical job exists. Throws JobConflictError if a job with this name differs. */
    createJob(job: JobDefinition): Promise<boolean>;
    /** Returns chunks left in progress by an interrupted run to pending. Returns how many. */
    releaseInProgress(name: string): Promise<number>;
    /** Atomically claims the lowest pending chunk for a worker. */
    claimChunk(name: string, worker: number): Promise<ClaimedChunk | null>;
    recordProgress(
        name: string,
        start: number,
        lastProcessedId: number,
    ): Promise<void>;
    completeChunk(name: string, start: number): Promise<void>;
    status(name: string): Promise<JobStatus | null>;
}
