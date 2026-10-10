import {
    JobConflictError,
    JobProgressRepository,
} from "@/repositories/JobProgressRepository";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const job = {
    name: "rescore",
    kind: "scores" as const,
    from: 1,
    to: 2500,
    chunkSize: 1000,
};

describe("JobProgressRepository", () => {
    let database: TestDatabase;
    let repository: JobProgressRepository;

    beforeEach(async () => {
        database = await createTestDatabase();
        repository = new JobProgressRepository(database.db);
    });

    afterEach(async () => {
        await database[Symbol.asyncDispose]();
    });

    it("splits the range into chunks, the last one shorter", async () => {
        expect(await repository.createJob(job)).toBe(true);

        const status = await repository.status("rescore");

        expect(status?.job).toEqual(job);
        expect(status?.chunks).toEqual({ done: 0, inProgress: 0, pending: 3 });

        const claimed = [
            await repository.claimChunk("rescore", 0),
            await repository.claimChunk("rescore", 1),
            await repository.claimChunk("rescore", 2),
        ];

        expect(claimed).toEqual([
            { start: 1, end: 1000, lastProcessedId: null },
            { start: 1001, end: 2000, lastProcessedId: null },
            { start: 2001, end: 2500, lastProcessedId: null },
        ]);
        expect(await repository.claimChunk("rescore", 0)).toBeNull();
    });

    it("accepts an identical job again and refuses a different one", async () => {
        await repository.createJob(job);

        expect(await repository.createJob(job)).toBe(false);
        await expect(
            repository.createJob({ ...job, to: 3000 }),
        ).rejects.toBeInstanceOf(JobConflictError);
        await expect(
            repository.createJob({ ...job, kind: "total-pp" }),
        ).rejects.toBeInstanceOf(JobConflictError);
        await expect(
            repository.createJob({ ...job, chunkSize: 10 }),
        ).rejects.toBeInstanceOf(JobConflictError);
    });

    it("resumes a released chunk after its last processed ID", async () => {
        await repository.createJob(job);
        const chunk = await repository.claimChunk("rescore", 0);

        await repository.recordProgress("rescore", chunk!.start, 42);

        expect(await repository.releaseInProgress("rescore")).toBe(1);
        expect(await repository.claimChunk("rescore", 3)).toEqual({
            start: 1,
            end: 1000,
            lastProcessedId: 42,
        });
    });

    it("never hands out a done chunk", async () => {
        await repository.createJob({ ...job, to: 1000 });
        const chunk = await repository.claimChunk("rescore", 0);

        await repository.completeChunk("rescore", chunk!.start);

        expect(await repository.releaseInProgress("rescore")).toBe(0);
        expect(await repository.claimChunk("rescore", 0)).toBeNull();
        expect((await repository.status("rescore"))?.chunks).toEqual({
            done: 1,
            inProgress: 0,
            pending: 0,
        });
    });

    it("gives concurrent claims different chunks", async () => {
        await repository.createJob(job);

        const claims = await Promise.all(
            [0, 1, 2, 3].map((worker) =>
                repository.claimChunk("rescore", worker),
            ),
        );
        const starts = claims.filter((c) => c !== null).map((c) => c.start);

        expect(new Set(starts).size).toBe(3);
        expect(claims.filter((c) => c === null)).toHaveLength(1);
    });

    it("reports active chunks with their worker and progress", async () => {
        await repository.createJob(job);
        await repository.claimChunk("rescore", 5);
        await repository.recordProgress("rescore", 1, 7);

        expect((await repository.status("rescore"))?.active).toEqual([
            { start: 1, end: 1000, worker: 5, lastProcessedId: 7 },
        ]);
    });

    it("creates large ranges in batches", async () => {
        await repository.createJob({
            ...job,
            name: "big",
            from: 1,
            to: 25_000_000,
            chunkSize: 1000,
        });

        expect((await repository.status("big"))?.chunks.pending).toBe(25_000);
    });

    it("returns null for an unknown job", async () => {
        expect(await repository.status("missing")).toBeNull();
    });
});
