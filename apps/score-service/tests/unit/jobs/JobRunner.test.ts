import { JobRunner } from "@/jobs/JobRunner";
import {
    JobConflictError,
    type JobDefinition,
} from "@/repositories/IJobProgressRepository";
import { JobProgressRepository } from "@/repositories/JobProgressRepository";
import { RetryLaterError } from "@/types/errors";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance,
} from "vitest";

// Each test starts an in-memory Postgres, which is slow on a loaded machine.

const job: JobDefinition = {
    name: "rescore",
    kind: "scores",
    from: 1,
    to: 250,
    chunkSize: 100,
};

function range(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe("JobRunner", () => {
    let database: TestDatabase;
    let repository: JobProgressRepository;
    let runner: JobRunner;
    let delays: number[];
    let log: MockInstance<typeof console.log>;

    beforeEach(async () => {
        log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        database = await createTestDatabase();
        repository = new JobProgressRepository(database.db);
        runner = new JobRunner(repository);
        delays = [];
        runner.wait = vi.fn((ms: number) => {
            delays.push(ms);
            return Promise.resolve();
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await database[Symbol.asyncDispose]();
    });

    function options(
        process: (id: number) => Promise<void>,
        overrides: { concurrency?: number; signal?: AbortSignal } = {},
    ) {
        return {
            job,
            concurrency: overrides.concurrency ?? 3,
            signal: overrides.signal ?? new AbortController().signal,
            process,
        };
    }

    it("processes every ID exactly once", async () => {
        const seen: number[] = [];

        const result = await runner.run(
            options((id) => {
                seen.push(id);
                return Promise.resolve();
            }),
        );

        expect(result).toBe("finished");
        expect(seen.sort((a, b) => a - b)).toEqual(range(1, 250));
        expect((await repository.status("rescore"))?.chunks).toEqual({
            done: 3,
            inProgress: 0,
            pending: 0,
        });
    });

    it("processes each chunk in ascending order", async () => {
        const seen: number[] = [];

        await runner.run(
            options(
                (id) => {
                    seen.push(id);
                    return Promise.resolve();
                },
                { concurrency: 1 },
            ),
        );

        expect(seen).toEqual(range(1, 250));
    });

    it("retries an ID after the delay a RetryLaterError asks for, skipping nothing", async () => {
        const seen: number[] = [];
        let failed = false;

        await runner.run(
            options((id) => {
                if (id === 5 && !failed) {
                    failed = true;
                    return Promise.reject(new RetryLaterError("busy", 7000));
                }

                seen.push(id);
                return Promise.resolve();
            }),
        );

        expect(delays).toEqual([7000]);
        expect(seen.sort((a, b) => a - b)).toEqual(range(1, 250));
    });

    it.each([
        [0, 5000],
        [1000, 5000],
        [7000, 7000],
        [3_600_000, 300_000],
    ])(
        "waits %i ms asked by Retry-After as %i ms",
        async (retryAfterMs, expected) => {
            let failed = false;

            await runner.run(
                options((id) => {
                    if (id === 5 && !failed) {
                        failed = true;
                        return Promise.reject(
                            new RetryLaterError("busy", retryAfterMs),
                        );
                    }

                    return Promise.resolve();
                }),
            );

            expect(delays).toEqual([expected]);
        },
    );

    it("retries a plain error with doubling backoff and logs each attempt", async () => {
        let failures = 0;

        await runner.run(
            options((id) => {
                if (id === 5 && failures < 2) {
                    ++failures;
                    return Promise.reject(new Error("boom"));
                }

                return Promise.resolve();
            }),
        );

        expect(delays).toEqual([5000, 10_000]);
        expect(log).toHaveBeenCalledWith("ID 5 failed (boom); retrying in 5 s");
        expect(log).toHaveBeenCalledWith(
            "ID 5 failed (boom); retrying in 10 s",
        );
    });

    it("resumes an interrupted run where it stopped", async () => {
        const controller = new AbortController();
        const first: number[] = [];

        const interrupted = await runner.run(
            options(
                (id) => {
                    first.push(id);

                    if (id === 150) {
                        controller.abort();
                    }

                    return Promise.resolve();
                },
                { concurrency: 1, signal: controller.signal },
            ),
        );

        expect(interrupted).toBe("interrupted");
        expect(first).toEqual(range(1, 150));

        const status = await repository.status("rescore");

        expect(status?.chunks).toEqual({ done: 1, inProgress: 1, pending: 1 });
        expect(status?.active).toEqual([
            { start: 101, end: 200, worker: 0, lastProcessedId: 150 },
        ]);

        const second: number[] = [];
        const finished = await runner.run(
            options(
                (id) => {
                    second.push(id);
                    return Promise.resolve();
                },
                { concurrency: 1 },
            ),
        );

        expect(finished).toBe("finished");
        expect(second).toEqual(range(151, 250));
    });

    it("resumes at a different concurrency, processing every ID", async () => {
        const controller = new AbortController();
        const first: number[] = [];

        const interrupted = await runner.run(
            options(
                (id) => {
                    first.push(id);

                    if (first.length === 120) {
                        controller.abort();
                    }

                    return Promise.resolve();
                },
                { concurrency: 3, signal: controller.signal },
            ),
        );

        expect(interrupted).toBe("interrupted");

        const second: number[] = [];
        const finished = await runner.run(
            options(
                (id) => {
                    second.push(id);
                    return Promise.resolve();
                },
                { concurrency: 1 },
            ),
        );

        expect(finished).toBe("finished");

        const all = [...first, ...second];

        expect(new Set(all)).toEqual(new Set(range(1, 250)));
        // Only IDs in flight when the abort hit may be done twice.
        expect(all.length - 250).toBeLessThanOrEqual(3);
        expect((await repository.status("rescore"))?.chunks).toEqual({
            done: 3,
            inProgress: 0,
            pending: 0,
        });
    });

    it("rejects a concurrency below 1 before touching the repository", async () => {
        await expect(
            runner.run(options(() => Promise.resolve(), { concurrency: 0 })),
        ).rejects.toThrow(new RangeError("concurrency must be at least 1"));
        expect(await repository.status("rescore")).toBeNull();
    });

    it("stops during a retry wait without recording the failed ID", async () => {
        const controller = new AbortController();

        runner.wait = vi.fn(() => {
            controller.abort();
            return Promise.resolve();
        });

        const result = await runner.run(
            options(
                (id) =>
                    id === 5
                        ? Promise.reject(new Error("boom"))
                        : Promise.resolve(),
                { concurrency: 1, signal: controller.signal },
            ),
        );

        expect(result).toBe("interrupted");

        const status = await repository.status("rescore");

        expect(status?.active).toEqual([
            { start: 1, end: 100, worker: 0, lastProcessedId: 4 },
        ]);
    });

    it("rejects a job whose name exists with a different range, before processing", async () => {
        await repository.createJob(job);

        const process = vi.fn(() => Promise.resolve());

        await expect(
            runner.run({
                ...options(process),
                job: { ...job, to: 3000 },
            }),
        ).rejects.toBeInstanceOf(JobConflictError);
        expect(process).not.toHaveBeenCalled();
    });

    it("logs one line per finished chunk, not per ID", async () => {
        await runner.run(options(() => Promise.resolve()));

        const chunkLines = log.mock.calls
            .map((call) => String(call[0]))
            .filter((line) => line.startsWith("Chunk "))
            .sort();

        expect(chunkLines).toEqual([
            "Chunk 101–200 done",
            "Chunk 1–100 done",
            "Chunk 201–250 done",
        ]);
        expect(log).toHaveBeenCalledTimes(3);
    });
});
