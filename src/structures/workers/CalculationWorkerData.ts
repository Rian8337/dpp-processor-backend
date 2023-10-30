import { Modes } from "@rian8337/osu-base";
import { PPCalculationMethod } from "../PPCalculationMethod";
import { CloneablePerformanceCalculationParameters } from "../../utils/calculator/CloneablePerformanceCalculationParameters";
import { RawDifficultyAttributes } from "../attributes/RawDifficultyAttributes";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";

/**
 * Represents data to be passed into a calculation worker.
 */
export interface CalculationWorkerData {
    /**
     * The beatmap file to calculate.
     */
    readonly beatmapFile: string;

    /**
     * The gamemode to calculate for.
     */
    readonly gamemode: Modes;

    /**
     * The calculation method to use.
     */
    readonly calculationMethod: PPCalculationMethod;

    /**
     * The cached difficulty attributes, if any.
     */
    difficultyAttributes?: CacheableDifficultyAttributes<RawDifficultyAttributes> | null;

    /**
     * The replay file to calculate for.
     */
    readonly replayFile?: Blob;

    /**
     * Calculation parameters.
     */
    readonly parameters?: CloneablePerformanceCalculationParameters;
}
