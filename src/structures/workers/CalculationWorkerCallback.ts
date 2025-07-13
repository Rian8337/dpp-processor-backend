import { CompleteCalculationAttributes } from "../attributes/CompleteCalculationAttributes";
import { PerformanceAttributes } from "../attributes/PerformanceAttributes";
import { RawDifficultyAttributes } from "../attributes/RawDifficultyAttributes";

/**
 * Represents a callback that is called to return the result of a worker task.
 */
export type CalculationWorkerCallback = (
    result:
        | Error
        | null
        | {
              readonly attributes: CompleteCalculationAttributes<
                  RawDifficultyAttributes,
                  PerformanceAttributes
              >;
              readonly strainChart?: Uint8Array;
          },
) => unknown;
