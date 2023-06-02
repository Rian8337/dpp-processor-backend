import { CompleteCalculationAttributes } from "../attributes/CompleteCalculationAttributes";
import { PerformanceAttributes } from "../attributes/PerformanceAttributes";
import { RawDifficultyAttributes } from "../attributes/RawDifficultyAttributes";

/**
 * Represents a callback that is called to return the result of a worker task.
 */
export type CalculationWorkerCallback = (
    err: Error | null,
    result: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >
) => unknown;
