import { CalculationWorkerCallback } from "./CalculationWorkerCallback";
import { CalculationWorkerData } from "./CalculationWorkerData";

/**
 * Represents a task that is passed onto a worker.
 */
export interface CalculationWorkerTask {
    /**
     * The data to be passed to a worker.
     */
    readonly data: CalculationWorkerData;

    /**
     * The callback that is called when the task has completed.
     */
    readonly callback: CalculationWorkerCallback;
}
