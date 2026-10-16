export interface RequestRecord {
    /** The resolved variant, or `null` for requests that did not reach one (listing, 401, 404, 429). */
    readonly variant: string | null;
    /** A key's name, `anonymous`, or `unauthenticated` (rejected key). */
    readonly caller: string;
    readonly status: number;
    readonly durationMs: number;
}

export interface IUsageStats {
    record(request: RequestRecord): void;
    recordRateLimited(caller: string): void;
    /** The summary lines since the last call, then resets. Empty if nothing was recorded. */
    takeSummary(): string[];
    /** Logs a summary every `USAGE_SUMMARY_INTERVAL_SECONDS`; disposing logs a final one. Does nothing when the interval is 0. */
    start(): Disposable;
}
