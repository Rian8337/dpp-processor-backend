import { dependencyTokens } from "@/dependencies/tokens";
import type { IJobProgressRepository } from "@/repositories/IJobProgressRepository";
import { RetryLaterError } from "@/types/errors";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import { backoffDelay, sleep } from "./backoff";
import type { IJobRunner, JobRunOptions, JobRunResult } from "./IJobRunner";

const retryBaseMs = 5000;
const retryMaxMs = 5 * 60_000;

/**
 * Runs a chunked, resumable job. Workers claim chunks from Postgres, so any concurrency can resume any run. An ID is
 * never skipped: failures retry the same ID until it succeeds or the run is interrupted.
 */
@Injectable(dependencyTokens.jobRunner)
export class JobRunner implements IJobRunner {
    /** Waits between retries; tests replace it. */
    wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep;

    constructor(
        @inject(dependencyTokens.jobProgressRepository)
        private readonly repository: IJobProgressRepository,
    ) {}

    async run(options: JobRunOptions): Promise<JobRunResult> {
        const { job, signal } = options;

        if (options.concurrency < 1) {
            throw new RangeError("concurrency must be at least 1");
        }

        const created = await this.repository.createJob(job);

        if (!created) {
            const released = await this.repository.releaseInProgress(job.name);

            console.log(
                `Resuming job ${job.name}${released > 0 ? ` (${released.toString()} interrupted chunk(s))` : ""}`,
            );
        }

        await Promise.all(
            Array.from({ length: options.concurrency }, (_, worker) =>
                this.work(worker, options),
            ),
        );

        return signal.aborted ? "interrupted" : "finished";
    }

    private async work(worker: number, options: JobRunOptions): Promise<void> {
        const { job, signal } = options;

        while (!signal.aborted) {
            const chunk = await this.repository.claimChunk(job.name, worker);

            if (!chunk) {
                return;
            }

            const first = Math.max(
                chunk.start,
                (chunk.lastProcessedId ?? chunk.start - 1) + 1,
            );

            for (let id = first; id <= chunk.end; ++id) {
                if (!(await this.processWithRetry(id, options))) {
                    return;
                }

                await this.repository.recordProgress(job.name, chunk.start, id);
            }

            await this.repository.completeChunk(job.name, chunk.start);
            console.log(
                `Chunk ${chunk.start.toString()}–${chunk.end.toString()} done`,
            );
        }
    }

    /**
     * @returns false if the run was interrupted before the ID succeeded.
     */
    private async processWithRetry(
        id: number,
        options: JobRunOptions,
    ): Promise<boolean> {
        for (let attempt = 0; !options.signal.aborted; ++attempt) {
            try {
                await options.process(id);
                return true;
            } catch (e) {
                const backoff = backoffDelay(attempt, retryBaseMs, retryMaxMs);
                const delayMs =
                    e instanceof RetryLaterError && e.retryAfterMs !== undefined
                        ? // Never retry sooner than the base delay, even for "Retry-After: 0".
                          Math.min(
                              Math.max(e.retryAfterMs, retryBaseMs),
                              retryMaxMs,
                          )
                        : backoff;

                console.log(
                    `ID ${id.toString()} failed (${e instanceof Error ? e.message : String(e)}); retrying in ${Math.round(delayMs / 1000).toString()} s`,
                );
                await this.wait(delayMs, options.signal);
            }
        }

        return false;
    }
}
