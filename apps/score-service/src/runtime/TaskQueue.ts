/**
 * Runs keyed tasks with a concurrency limit. A key is never queued or running twice at once.
 */
export class TaskQueue implements AsyncDisposable {
    private readonly queue: { key: string; task: () => Promise<void> }[] = [];
    private readonly keys = new Set<string>();
    private readonly running = new Set<Promise<void>>();
    private idleWaiters: (() => void)[] = [];
    private disposed = false;

    constructor(private readonly concurrency: number) {}

    /** Queued plus running. */
    get size(): number {
        return this.queue.length + this.running.size;
    }

    /** Queues a task under a key; ignored (returns false) while that key is queued or running. Task errors are logged. */
    add(key: string, task: () => Promise<void>): boolean {
        if (this.disposed || this.keys.has(key)) {
            return false;
        }

        this.keys.add(key);
        this.queue.push({ key, task });
        this.next();

        return true;
    }

    /** Resolves when nothing is queued or running. */
    onIdle(): Promise<void> {
        return this.size === 0
            ? Promise.resolve()
            : new Promise((resolve) => this.idleWaiters.push(resolve));
    }

    /** Drops queued tasks and waits for running ones. */
    async [Symbol.asyncDispose](): Promise<void> {
        this.disposed = true;

        for (const { key } of this.queue.splice(0)) {
            this.keys.delete(key);
        }

        await Promise.all(this.running);
    }

    private next(): void {
        while (
            !this.disposed &&
            this.running.size < this.concurrency &&
            this.queue.length > 0
        ) {
            const { key, task } = this.queue.shift()!;
            const run = task()
                .catch((e: unknown) => {
                    console.error(`Task ${key} failed:`, e);
                })
                .finally(() => {
                    this.running.delete(run);
                    this.keys.delete(key);
                    this.next();

                    if (this.size === 0) {
                        for (const resolve of this.idleWaiters.splice(0)) {
                            resolve();
                        }
                    }
                });

            this.running.add(run);
        }
    }
}
