import {
    CalculationFailedError,
    ServiceUnavailableError,
} from "@/types/errors";
import type { Modes } from "@rian8337/osu-base";
import { Piscina } from "piscina";
import { BaseRunner } from "./BaseRunner";
import type { CalculationTask, TaskOutcome } from "./tasks";

export interface PiscinaRunnerOptions {
    readonly mode: Modes;
    readonly threads: number;
    readonly maxQueue: number;

    /**
     * The worker module. Defaults to `worker.mjs` next to the bundled entry, so workers run the snapshot's code.
     */
    readonly workerFile?: URL;
}

/**
 * Runs calculations in a pool of worker threads.
 */
export class PiscinaRunner extends BaseRunner {
    private readonly pool: Piscina<CalculationTask, TaskOutcome>;

    constructor(options: PiscinaRunnerOptions) {
        super();

        this.pool = new Piscina({
            filename: (
                options.workerFile ?? new URL("./worker.mjs", import.meta.url)
            ).href,
            workerData: { mode: options.mode },
            minThreads: options.threads,
            maxThreads: options.threads,
            maxQueue: options.maxQueue,
        });
    }

    protected async dispatch(task: CalculationTask): Promise<TaskOutcome> {
        try {
            return await this.pool.run(task);
        } catch (e) {
            if (e instanceof Error && /queue is at limit/i.test(e.message)) {
                throw new ServiceUnavailableError(
                    "OVERLOADED",
                    "Calculation queue is full; retry later",
                );
            }

            throw new CalculationFailedError(
                e instanceof Error ? e.message : "Calculation worker failed",
            );
        }
    }

    /**
     * Waits for queued and running tasks to finish, then stops the workers.
     */
    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.close();
    }
}
