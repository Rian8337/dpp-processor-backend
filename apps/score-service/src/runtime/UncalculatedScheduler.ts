import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { IUncalculatedReplayService } from "@/services/IUncalculatedReplayService";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";

/**
 * Runs the uncalculated-replay pass at startup and then at a fixed interval; passes never overlap.
 */
@Injectable(dependencyTokens.uncalculatedScheduler)
export class UncalculatedScheduler implements AsyncDisposable {
    private timer: NodeJS.Timeout | undefined;
    private running: Promise<void> | undefined;
    private readonly abort = new AbortController();

    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
        @inject(dependencyTokens.uncalculatedReplayService)
        private readonly service: IUncalculatedReplayService,
    ) {}

    /** Runs a pass now, then every `UNCALCULATED_INTERVAL_MINUTES`; a pass never overlaps another. */
    start(): void {
        this.run();
        this.timer = setInterval(
            () => this.run(),
            this.config.uncalculatedIntervalMinutes * 60_000,
        );
    }

    async [Symbol.asyncDispose](): Promise<void> {
        clearInterval(this.timer);
        this.abort.abort();
        await this.running;
    }

    private run(): void {
        if (this.running) {
            console.log(
                "Previous uncalculated pass still running; skipping this one",
            );
            return;
        }

        this.running = this.service
            .runPass(this.abort.signal)
            .catch((e: unknown) => {
                console.error("Uncalculated pass failed:", e);
            })
            .finally(() => {
                this.running = undefined;
            });
    }
}
