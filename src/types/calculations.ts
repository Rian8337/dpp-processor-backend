import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import {
    PerformanceAttributes,
    RawDifficultyAttributes,
    ReplayAttributes,
} from "./attributes";
import { CloneableCalculationParameters } from "./parameters";

/**
 * An attribute with complete calculation result.
 */
export interface CompleteCalculationAttributes<
    TDiffAttr extends RawDifficultyAttributes,
    TPerfAttr extends PerformanceAttributes,
> {
    /**
     * The parameters that were used to obtain the calculation result.
     */
    readonly params: CloneableCalculationParameters<true>;

    /**
     * The difficulty attributes.
     */
    readonly difficulty: CacheableDifficultyAttributes<TDiffAttr>;

    /**
     * The performance attributes.
     */
    readonly performance: TPerfAttr;

    /**
     * The replay attributes, if any.
     */
    readonly replay?: ReplayAttributes;

    /**
     * The MD5 hash of the local replay file, if the file is present.
     */
    localReplayMD5?: string;
}

/**
 * Available calculation methods.
 */
export enum CalculationMethod {
    live,
    rebalance,
}
