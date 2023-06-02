import { Worker } from "worker_threads";
import { CalculationWorkerTaskHandler } from "../../utils/workers/CalculationWorkerTaskHandler";

/**
 * A worker that is used for difficulty calculation.
 */
export interface CalculationWorker {
    /**
     * The task handler of this worker.
     */
    taskHandler: CalculationWorkerTaskHandler | null;

    /**
     * The worker thread.
     */
    readonly worker: Worker;
}
