import { setTimeout as delay } from "node:timers/promises";

/** min(baseMs × 2^attempt, maxMs), attempt counted from 0. */
export function backoffDelay(
    attempt: number,
    baseMs: number,
    maxMs: number,
): number {
    return Math.min(baseMs * 2 ** Math.min(attempt, 30), maxMs);
}

/** Resolves after `ms`, or early (without throwing) when `signal` aborts. */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    try {
        await delay(ms, undefined, { signal });
    } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
            throw e;
        }
    }
}
