import { jobChunksTable, jobsTable } from "@/database/schema";
import type { Database } from "@/database/types";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { inject } from "tsyringe";
import {
    JobConflictError,
    type ClaimedChunk,
    type IJobProgressRepository,
    type JobDefinition,
    type JobStatus,
} from "./IJobProgressRepository";

export { JobConflictError } from "./IJobProgressRepository";

const insertBatchSize = 1000;

@Injectable(dependencyTokens.jobProgressRepository)
export class JobProgressRepository implements IJobProgressRepository {
    constructor(@inject(dependencyTokens.db) private readonly db: Database) {}

    async createJob(job: JobDefinition): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const inserted = await tx
                .insert(jobsTable)
                .values({
                    name: job.name,
                    kind: job.kind,
                    rangeFrom: job.from,
                    rangeTo: job.to,
                    chunkSize: job.chunkSize,
                })
                .onConflictDoNothing()
                .returning({ name: jobsTable.name });

            if (inserted.length === 0) {
                const [existing] = await tx
                    .select()
                    .from(jobsTable)
                    .where(eq(jobsTable.name, job.name));

                if (
                    existing?.kind !== job.kind ||
                    existing.rangeFrom !== job.from ||
                    existing.rangeTo !== job.to ||
                    existing.chunkSize !== job.chunkSize
                ) {
                    throw new JobConflictError(job.name);
                }

                return false;
            }

            let batch: (typeof jobChunksTable.$inferInsert)[] = [];

            for (
                let start = job.from;
                start <= job.to;
                start += job.chunkSize
            ) {
                batch.push({
                    jobName: job.name,
                    start,
                    end: Math.min(start + job.chunkSize - 1, job.to),
                });

                if (batch.length === insertBatchSize) {
                    await tx.insert(jobChunksTable).values(batch);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                await tx.insert(jobChunksTable).values(batch);
            }

            return true;
        });
    }

    async releaseInProgress(name: string): Promise<number> {
        const released = await this.db
            .update(jobChunksTable)
            .set({ status: "pending", updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.status, "in_progress"),
                ),
            )
            .returning({ start: jobChunksTable.start });

        return released.length;
    }

    async claimChunk(
        name: string,
        worker: number,
    ): Promise<ClaimedChunk | null> {
        // One statement, so two workers can never claim the same chunk.
        const claimed = await this.db
            .update(jobChunksTable)
            .set({ status: "in_progress", worker, updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(
                        jobChunksTable.start,
                        sql`(select ${jobChunksTable.start} from ${jobChunksTable}
                             where ${jobChunksTable.jobName} = ${name} and ${jobChunksTable.status} = 'pending'
                             order by ${jobChunksTable.start} limit 1 for update skip locked)`,
                    ),
                ),
            )
            .returning({
                start: jobChunksTable.start,
                end: jobChunksTable.end,
                lastProcessedId: jobChunksTable.lastProcessedId,
            });

        return claimed[0] ?? null;
    }

    async recordProgress(
        name: string,
        start: number,
        lastProcessedId: number,
    ): Promise<void> {
        await this.db
            .update(jobChunksTable)
            .set({ lastProcessedId, updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.start, start),
                ),
            );
    }

    async completeChunk(name: string, start: number): Promise<void> {
        await this.db
            .update(jobChunksTable)
            .set({ status: "done", updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.start, start),
                ),
            );
    }

    async status(name: string): Promise<JobStatus | null> {
        const [job] = await this.db
            .select()
            .from(jobsTable)
            .where(eq(jobsTable.name, name));

        if (!job) {
            return null;
        }

        const counts = await this.db
            .select({ status: jobChunksTable.status, count: count() })
            .from(jobChunksTable)
            .where(eq(jobChunksTable.jobName, name))
            .groupBy(jobChunksTable.status);

        const countOf = (status: string) =>
            counts.find((row) => row.status === status)?.count ?? 0;

        const active = await this.db
            .select({
                start: jobChunksTable.start,
                end: jobChunksTable.end,
                worker: jobChunksTable.worker,
                lastProcessedId: jobChunksTable.lastProcessedId,
            })
            .from(jobChunksTable)
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.status, "in_progress"),
                ),
            )
            .orderBy(asc(jobChunksTable.start));

        return {
            job: {
                name: job.name,
                kind: job.kind,
                from: job.rangeFrom,
                to: job.rangeTo,
                chunkSize: job.chunkSize,
            },
            chunks: {
                done: countOf("done"),
                inProgress: countOf("in_progress"),
                pending: countOf("pending"),
            },
            active,
        };
    }
}
