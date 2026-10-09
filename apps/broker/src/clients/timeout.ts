/**
 * An abort signal with a deadline. Disposing clears the timer.
 */
export interface Timeout extends Disposable {
    readonly signal: AbortSignal;
}

/**
 * Like `AbortSignal.timeout`, but built on `setTimeout`, so tests can advance it with fake timers (vitest cannot
 * fake `AbortSignal.timeout`, which uses Node's internal timers). The signal aborts with a `TimeoutError`
 * `DOMException`, as `AbortSignal.timeout` does.
 */
export function createTimeout(ms: number): Timeout {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(
            new DOMException("The operation timed out", "TimeoutError"),
        );
    }, ms);

    return {
        signal: controller.signal,
        [Symbol.dispose]: () => clearTimeout(timer),
    };
}
