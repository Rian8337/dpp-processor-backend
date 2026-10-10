import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { backoffDelay } from "@/jobs/backoff";
import type { IReplayStore } from "@/replays/IReplayStore";
import type { IReplaySubmissionService } from "@/services/IReplaySubmissionService";
import { Injectable } from "@dpp/server";
import { watch, type FSWatcher } from "chokidar";
import { basename } from "node:path";
import { inject } from "tsyringe";
import { TaskQueue } from "./TaskQueue";

const retryBaseMs = 30_000;
const retryMaxMs = 10 * 60_000;

/**
 * Processes replays the game drops into the unprocessed folder: those present at startup, then new ones once fully
 * written. Files that fail temporarily stay on disk and are retried with backoff (and at the latest on the next
 * startup).
 */
@Injectable(dependencyTokens.replayWatcher)
export class ReplayWatcher implements AsyncDisposable {
    private readonly queue: TaskQueue;
    private readonly attempts = new Map<string, number>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private watcher: FSWatcher | undefined;
    private stopped = false;

    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
        @inject(dependencyTokens.replayStore)
        private readonly store: IReplayStore,
        @inject(dependencyTokens.replaySubmissionService)
        private readonly submissions: IReplaySubmissionService,
    ) {
        this.queue = new TaskQueue(config.replayConcurrency);
    }

    /** Watches the unprocessed folder, then queues the files already there. */
    async start(): Promise<void> {
        const watcher = watch(this.config.replayDirectories.unprocessed, {
            ignoreInitial: true,
            depth: 0,
            awaitWriteFinish: true,
        });

        this.watcher = watcher;
        watcher.on("add", (path) => this.enqueue(basename(path)));
        watcher.on("error", (e) => console.error("Replay watcher error:", e));
        await new Promise<void>((resolve) =>
            watcher.once("ready", () => resolve()),
        );

        const backlog = await this.store.list("unprocessed");

        if (backlog.length > 0) {
            console.log(
                `Processing ${backlog.length.toString()} unprocessed replay file(s)`,
            );
        }

        for (const fileName of backlog) {
            this.enqueue(fileName);
        }
    }

    /** Processes one file now (used by the watcher and the backlog; exposed for tests). */
    async handle(fileName: string): Promise<void> {
        if (!fileName.endsWith(".odr")) {
            await this.store.delete("unprocessed", fileName);
            return;
        }

        const file = await this.store.read("unprocessed", fileName);

        if (!file) {
            this.attempts.delete(fileName);
            return;
        }

        const result = await this.submissions.process(fileName, file);

        if (result.action === "delete") {
            await this.store.delete("unprocessed", fileName);
            this.attempts.delete(fileName);
            console.log(`Processed replay ${fileName}: ${result.reason}`);
            return;
        }

        this.scheduleRetry(fileName, result.retryAfterMs, result.reason);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.stopped = true;

        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        this.timers.clear();
        await this.watcher?.close();
        await this.queue[Symbol.asyncDispose]();
    }

    private enqueue(fileName: string): void {
        if (!this.stopped) {
            this.queue.add(fileName, () => this.handle(fileName));
        }
    }

    private scheduleRetry(
        fileName: string,
        retryAfterMs: number | undefined,
        reason: string,
    ): void {
        if (this.stopped) {
            return;
        }

        const attempt = this.attempts.get(fileName) ?? 0;
        const delayMs = Math.min(
            Math.max(
                backoffDelay(attempt, retryBaseMs, retryMaxMs),
                retryAfterMs ?? 0,
            ),
            retryMaxMs,
        );

        this.attempts.set(fileName, attempt + 1);
        console.log(
            `Keeping replay ${fileName} (${reason}); retrying in ${Math.round(delayMs / 1000).toString()} s`,
        );
        clearTimeout(this.timers.get(fileName));
        this.timers.set(
            fileName,
            setTimeout(() => {
                this.timers.delete(fileName);
                this.enqueue(fileName);
            }, delayMs),
        );
    }
}
