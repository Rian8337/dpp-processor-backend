import type { IJobRunner } from "@/jobs/IJobRunner";
import {
    JobConflictError,
    type IJobProgressRepository,
    type JobKind,
} from "@/repositories/IJobProgressRepository";
import type { IScoreRecalculationService } from "@/services/IScoreRecalculationService";
import type { ITotalPPService } from "@/services/ITotalPPService";
import { CliUsageError, parseCliArguments } from "./arguments";

export interface CliDependencies {
    readonly runner: IJobRunner;
    readonly scores: IScoreRecalculationService;
    readonly totalPP: ITotalPPService;
    readonly progress: Pick<IJobProgressRepository, "status">;
    readonly signal: AbortSignal;
    readonly out: { log(line: string): void; error(line: string): void };
}

const usage = `Usage:
  recalculate-scores --name <job> --from <score id> --to <score id> [--concurrency 4] [--chunk-size 1000]
  recalculate-total-pp --name <job> --from <uid> --to <uid> [--concurrency 4] [--chunk-size 1000]
  job-status <job>`;

/**
 * Exit code: 0 finished or status printed, 1 usage or conflict error, 130 interrupted.
 */
export async function runCli(
    argv: readonly string[],
    deps: CliDependencies,
): Promise<number> {
    const { out } = deps;

    try {
        const command = parseCliArguments(argv);

        if (command.name === "job-status") {
            return await printStatus(command.job, deps);
        }

        const kind: JobKind =
            command.name === "recalculate-scores" ? "scores" : "total-pp";

        const result = await deps.runner.run({
            job: {
                name: command.job,
                kind,
                from: command.from,
                to: command.to,
                chunkSize: command.chunkSize,
            },
            concurrency: command.concurrency,
            signal: deps.signal,
            process: (id) =>
                kind === "scores"
                    ? deps.scores.recalculate(id)
                    : deps.totalPP.recalculate(id),
        });

        if (result === "interrupted") {
            out.log(
                `Job ${command.job} interrupted; run the same command to resume`,
            );

            return 130;
        }

        out.log(`Job ${command.job} finished`);

        return 0;
    } catch (e) {
        if (e instanceof CliUsageError) {
            out.error(e.message);
            out.error(usage);

            return 1;
        }

        if (e instanceof JobConflictError) {
            out.error(e.message);

            return 1;
        }

        throw e;
    }
}

async function printStatus(
    job: string,
    { progress, out }: CliDependencies,
): Promise<number> {
    const status = await progress.status(job);

    if (!status) {
        out.error(`No job named ${job}`);

        return 1;
    }

    const { chunks } = status;

    out.log(
        `Job ${status.job.name} (${status.job.kind}): IDs ${status.job.from}–${status.job.to}, chunk size ${status.job.chunkSize}`,
    );
    out.log(
        `Chunks: ${chunks.done} done, ${chunks.inProgress} in progress, ${chunks.pending} pending`,
    );

    for (const chunk of status.active) {
        out.log(
            `  ${chunk.start}–${chunk.end}: worker ${chunk.worker ?? "unknown"}, ${
                chunk.lastProcessedId === null
                    ? "not started"
                    : `last processed ${chunk.lastProcessedId}`
            }`,
        );
    }

    return 0;
}
