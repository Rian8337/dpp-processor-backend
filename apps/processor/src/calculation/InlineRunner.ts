import type { Algorithm } from "@/algorithms/types";
import { BaseRunner } from "./BaseRunner";
import {
    CalculationTaskHandler,
    type CalculationTask,
    type TaskOutcome,
} from "./tasks";

/**
 * Runs calculations on the calling thread. Used in tests and when `CALCULATION_THREADS` is 0.
 */
export class InlineRunner extends BaseRunner {
    private readonly handler: CalculationTaskHandler;

    constructor(algorithm: Algorithm) {
        super();
        this.handler = new CalculationTaskHandler(algorithm);
    }

    protected dispatch(task: CalculationTask): Promise<TaskOutcome> {
        return this.handler.handle(task);
    }

    [Symbol.asyncDispose](): Promise<void> {
        // Nothing to release: tasks run on the calling thread.
        return Promise.resolve();
    }
}
