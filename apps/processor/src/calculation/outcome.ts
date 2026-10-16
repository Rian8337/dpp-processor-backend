import { AlgorithmInputError } from "@/algorithms/errors";
import { CalculationFailedError } from "@/types/errors";
import type { TaskOutcome } from "./tasks";

/**
 * Returns a task's value, or throws the API error matching its failure.
 *
 * @template T The value type the task produces. Workers return untyped data, so the caller states it.
 */
export function unwrapOutcome<T>(outcome: TaskOutcome): T {
    if (!outcome.ok) {
        throw outcome.code === "CALCULATION_FAILED"
            ? new CalculationFailedError(outcome.message)
            : new AlgorithmInputError(
                  outcome.code,
                  outcome.message,
              ).toApiError();
    }

    // The task kind determines the value type; BaseRunner pairs each kind with its type.
    return outcome.value as T;
}
