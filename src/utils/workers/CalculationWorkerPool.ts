import EventEmitter from "events";
import { availableParallelism } from "os";
import { Worker, isMainThread } from "worker_threads";
import { resolve } from "path";
import { CalculationWorkerTask } from "../../structures/workers/CalculationWorkerTask";
import { CalculationWorker } from "../../structures/workers/CalculationWorker";
import { CalculationWorkerTaskHandler } from "./CalculationWorkerTaskHandler";

/**
 * A worker pool for handling difficulty calculations.
 */
export class CalculationWorkerPool extends EventEmitter {
    /**
     * The amount of threads this worker pool has.
     */
    readonly threadAmount = availableParallelism();

    private readonly workers: CalculationWorker[] = [];
    private readonly freeWorkers: CalculationWorker[] = [];
    private readonly tasks: CalculationWorkerTask[] = [];
    private readonly kWorkerFreedEvent = Symbol("kWorkerFreedEvent");

    constructor() {
        super();

        if (!isMainThread) {
            return;
        }

        console.log("Creating", this.threadAmount, "worker threads");

        for (let i = 0; i < this.threadAmount; ++i) {
            this.addNewWorker();
        }

        // Any time the kWorkerFreedEvent is emitted, dispatch
        // the next task pending in the queue, if any.
        this.on(this.kWorkerFreedEvent, () => {
            const task = this.tasks.shift();

            if (task) {
                this.runTask(task);
            }
        });
    }

    /**
     * Runs a task.
     *
     * The task will be run immediately in a free worker, if available. Otherwise,
     * the task will be queued.
     *
     * @param task The task to be run.
     */
    runTask(task: CalculationWorkerTask): void {
        if (this.freeWorkers.length === 0) {
            // No free threads, wait until a worker thread becomes free.
            this.tasks.push(task);
            return;
        }

        const worker = this.freeWorkers.pop();
        if (!worker) {
            return;
        }

        worker.taskHandler = new CalculationWorkerTaskHandler(task.callback);
        worker.worker.postMessage(task.data);
    }

    /**
     * Closes this worker pool and terminates all workers.
     */
    close() {
        for (const { worker } of this.workers) {
            worker.terminate();
        }
    }

    /**
     * Adds a new worker to this worker pool.
     */
    private addNewWorker(): void {
        const worker: CalculationWorker = {
            taskHandler: null,
            worker: new Worker(resolve(__dirname, "calculationProcessor.js")),
        };

        worker.worker.on("message", (result) => {
            // In case of success: Call the callback that was passed to `runTask`,
            // remove the `TaskHandler` associated with the Worker, and mark it as free
            // again.
            if (result instanceof Error) {
                worker.taskHandler?.done(result, null);
            } else {
                worker.taskHandler?.done(null, result);
            }

            worker.taskHandler = null;

            this.freeWorkers.push(worker);
            this.emit(this.kWorkerFreedEvent);
        });

        worker.worker.on("error", (err) => {
            // In case of an uncaught exception: Call the callback that was passed to
            // `runTask` with the error.
            if (worker.taskHandler) {
                worker.taskHandler.done(err, null);
            } else {
                this.emit("error", err);
            }

            // Remove the worker from the list and start a new worker to replace the
            // current one.
            this.workers.splice(this.workers.indexOf(worker), 1);
            this.addNewWorker();
        });

        this.workers.push(worker);
        this.freeWorkers.push(worker);
        this.emit(this.kWorkerFreedEvent);
    }
}
