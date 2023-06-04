import { PerformanceAttributes } from "./PerformanceAttributes";
import { RawDifficultyAttributes } from "./RawDifficultyAttributes";
import { ResponseDifficultyAttributes } from "./ResponseDifficultyAttributes";

/**
 * An attribute with complete calculation result.
 */
export interface CompleteCalculationAttributes<
    TDiffAttr extends RawDifficultyAttributes,
    TPerfAttr extends PerformanceAttributes
> {
    /**
     * The difficulty attributes.
     */
    readonly difficulty: ResponseDifficultyAttributes<TDiffAttr>;

    /**
     * The performance attributes.
     */
    readonly performance: TPerfAttr;
}
