export type UncalculatedOutcome = "processed" | "kept";

export interface IUncalculatedReplayService {
    /** One pass over the uncalculated folder, `UNCALCULATED_CONCURRENCY` files at once. Stops taking new files when `signal` aborts. */
    runPass(signal?: AbortSignal): Promise<void>;
    processFile(fileName: string): Promise<UncalculatedOutcome>;
}
