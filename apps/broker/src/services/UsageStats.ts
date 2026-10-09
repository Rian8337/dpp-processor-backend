import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IUsageStats, RequestRecord } from "./IUsageStats";

interface VariantUsage {
    readonly durations: number[];
    /** Status class (`2xx`) → count. */
    readonly statuses: Map<string, number>;
}

interface CallerUsage {
    requests: number;
    rateLimited: number;
}

/**
 * The nearest-rank percentile of sorted values.
 */
function percentile(sorted: readonly number[], p: number): number {
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const byName = <T>([a]: [string, T], [b]: [string, T]) =>
    a < b ? -1 : a > b ? 1 : 0;

@Injectable(dependencyTokens.usageStats)
export class UsageStats implements IUsageStats {
    private variants = new Map<string, VariantUsage>();
    private callers = new Map<string, CallerUsage>();
    private since = Date.now();

    constructor(
        @inject(dependencyTokens.config)
        private readonly config: Config,
    ) {}

    record(request: RequestRecord): void {
        this.callerUsage(request.caller).requests++;

        if (request.variant === null) {
            return;
        }

        let usage = this.variants.get(request.variant);

        if (!usage) {
            usage = { durations: [], statuses: new Map() };
            this.variants.set(request.variant, usage);
        }

        const statusClass = `${Math.floor(request.status / 100).toString()}xx`;

        usage.durations.push(Math.round(request.durationMs));
        usage.statuses.set(
            statusClass,
            (usage.statuses.get(statusClass) ?? 0) + 1,
        );
    }

    recordRateLimited(caller: string): void {
        this.callerUsage(caller).rateLimited++;
    }

    takeSummary(): string[] {
        const now = Date.now();
        const prefix = `Usage over ${Math.round((now - this.since) / 1000).toString()} s:`;
        const lines: string[] = [];

        for (const [name, usage] of [...this.variants].sort(byName)) {
            const sorted = [...usage.durations].sort((a, b) => a - b);
            const statuses = [...usage.statuses]
                .sort(byName)
                .map(
                    ([statusClass, count]) =>
                        `${statusClass} ${count.toString()}`,
                )
                .join(", ");

            lines.push(
                `${prefix} variant ${name}: ${sorted.length.toString()} requests (${statuses}), p50 ${percentile(sorted, 50).toString()} ms, p95 ${percentile(sorted, 95).toString()} ms`,
            );
        }

        for (const [name, usage] of [...this.callers].sort(byName)) {
            lines.push(
                `${prefix} caller ${name}: ${usage.requests.toString()} requests, ${usage.rateLimited.toString()} rate-limited`,
            );
        }

        this.variants = new Map();
        this.callers = new Map();
        this.since = now;

        return lines;
    }

    start(): Disposable {
        const intervalSeconds = this.config.usageSummaryIntervalSeconds;

        if (intervalSeconds === 0) {
            return { [Symbol.dispose]: () => undefined };
        }

        const timer = setInterval(() => {
            this.logSummary();
        }, intervalSeconds * 1000);

        timer.unref();

        return {
            [Symbol.dispose]: () => {
                clearInterval(timer);
                this.logSummary();
            },
        };
    }

    private logSummary(): void {
        for (const line of this.takeSummary()) {
            console.log(line);
        }
    }

    private callerUsage(caller: string): CallerUsage {
        let usage = this.callers.get(caller);

        if (!usage) {
            usage = { requests: 0, rateLimited: 0 };
            this.callers.set(caller, usage);
        }

        return usage;
    }
}
