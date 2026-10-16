import { runCli, type CliDependencies } from "@/cli/run";
import type { JobRunOptions, JobRunResult } from "@/jobs/IJobRunner";
import {
    JobConflictError,
    type JobStatus,
} from "@/repositories/IJobProgressRepository";
import { describe, expect, it, vi } from "vitest";

function setup(
    options: {
        result?: JobRunResult | Error;
        status?: JobStatus | null;
    } = {},
) {
    const logs: string[] = [];
    const errors: string[] = [];
    const runs: JobRunOptions[] = [];
    const scores = { recalculate: vi.fn(async () => {}) };
    const totalPP = { recalculate: vi.fn(async () => {}) };
    const signal = new AbortController().signal;

    const deps: CliDependencies = {
        runner: {
            async run(runOptions) {
                runs.push(runOptions);

                await runOptions.process(7);

                if (options.result instanceof Error) {
                    throw options.result;
                }

                return options.result ?? "finished";
            },
        },
        scores,
        totalPP,
        progress: { status: async () => options.status ?? null },
        signal,
        out: { log: (l) => logs.push(l), error: (l) => errors.push(l) },
    };

    return { deps, logs, errors, runs, scores, totalPP, signal };
}

const args = ["--name", "rescore-2026", "--from", "1", "--to", "100"];

describe("runCli", () => {
    it("runs a score recalculation job", async () => {
        const t = setup();

        expect(await runCli(["recalculate-scores", ...args], t.deps)).toBe(0);
        expect(t.runs[0]).toMatchObject({
            job: {
                name: "rescore-2026",
                kind: "scores",
                from: 1,
                to: 100,
                chunkSize: 1000,
            },
            concurrency: 4,
            signal: t.signal,
        });
        expect(t.scores.recalculate).toHaveBeenCalledWith(7);
        expect(t.totalPP.recalculate).not.toHaveBeenCalled();
        expect(t.logs).toEqual(["Job rescore-2026 finished"]);
    });

    it("runs a total pp job", async () => {
        const t = setup();

        expect(await runCli(["recalculate-total-pp", ...args], t.deps)).toBe(0);
        expect(t.runs[0]?.job.kind).toBe("total-pp");
        expect(t.totalPP.recalculate).toHaveBeenCalledWith(7);
        expect(t.scores.recalculate).not.toHaveBeenCalled();
    });

    it("returns 130 when interrupted", async () => {
        const t = setup({ result: "interrupted" });

        expect(await runCli(["recalculate-scores", ...args], t.deps)).toBe(130);
        expect(t.logs).toEqual([
            "Job rescore-2026 interrupted; run the same command to resume",
        ]);
    });

    it("reports a job conflict", async () => {
        const conflict = new JobConflictError("rescore-2026");
        const t = setup({ result: conflict });

        expect(await runCli(["recalculate-scores", ...args], t.deps)).toBe(1);
        expect(t.errors).toEqual([conflict.message]);
    });

    it("prints usage for a usage error", async () => {
        const t = setup();

        expect(await runCli(["recalculate-scores"], t.deps)).toBe(1);
        expect(t.errors[0]).toContain("--name is required");
        expect(t.errors.join("\n")).toContain("Usage:");
        expect(t.runs).toHaveLength(0);
    });

    it("prints job status", async () => {
        const t = setup({
            status: {
                job: {
                    name: "rescore-2026",
                    kind: "scores",
                    from: 1,
                    to: 2500,
                    chunkSize: 1000,
                },
                chunks: { done: 1, inProgress: 1, pending: 1 },
                active: [
                    {
                        start: 1001,
                        end: 2000,
                        worker: 2,
                        lastProcessedId: 1500,
                    },
                ],
            },
        });

        expect(await runCli(["job-status", "rescore-2026"], t.deps)).toBe(0);
        expect(t.logs).toEqual([
            "Job rescore-2026 (scores): IDs 1–2500, chunk size 1000",
            "Chunks: 1 done, 1 in progress, 1 pending",
            "  1001–2000: worker 2, last processed 1500",
        ]);
    });

    it("marks active chunks that have not started", async () => {
        const t = setup({
            status: {
                job: {
                    name: "x",
                    kind: "total-pp",
                    from: 1,
                    to: 10,
                    chunkSize: 10,
                },
                chunks: { done: 0, inProgress: 1, pending: 0 },
                active: [
                    { start: 1, end: 10, worker: 1, lastProcessedId: null },
                ],
            },
        });

        await runCli(["job-status", "x"], t.deps);

        expect(t.logs.at(-1)).toBe("  1–10: worker 1, not started");
    });

    it("reports an unknown job", async () => {
        const t = setup();

        expect(await runCli(["job-status", "x"], t.deps)).toBe(1);
        expect(t.errors).toEqual(["No job named x"]);
    });
});
