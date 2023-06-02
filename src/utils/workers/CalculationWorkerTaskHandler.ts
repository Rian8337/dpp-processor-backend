import { AsyncResource } from "async_hooks";
import { CalculationWorkerCallback } from "../../structures/workers/CalculationWorkerCallback";

/**
 * Represents a task handler of a calculation worker.
 */
export class CalculationWorkerTaskHandler extends AsyncResource {
    /**
     * The callback to be called when the worker has completed the task.
     */
    readonly callback: CalculationWorkerCallback;

    /**
     * @param callback The callback to be called when the worker has completed the task.
     */
    constructor(callback: CalculationWorkerCallback) {
        super("CalculationWorkerTaskHandler");

        this.callback = callback;
    }

    /**
     * Emits the callback associated with the calculation worker.
     *
     * @param err The error that resulted from the calculation worker.
     * @param result The result of the task. `null` if {@link err} is defined.
     */
    done(err: Error | null, result: unknown) {
        this.runInAsyncScope(this.callback, null, err, result);
        this.emitDestroy(); // `TaskInfo`s are used only once.
    }
}
