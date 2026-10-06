import type { Modes } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
    IPerformanceAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type {
    HitErrorInformation,
    SliderNestedHitObjectInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import type { z } from "zod";
import type {
    beatmapReferenceSchema,
    difficultyRequestSchema,
    performanceRequestSchema,
    replayPerformanceRequestSchema,
    scoreParametersSchema,
} from "./schemas";

export type BeatmapReference = z.infer<typeof beatmapReferenceSchema>;
export type ScoreParameters = z.infer<typeof scoreParametersSchema>;
export type DifficultyRequest = z.infer<typeof difficultyRequestSchema>;
export type PerformanceRequest = z.infer<typeof performanceRequestSchema>;
export type ReplayPerformanceRequest = z.infer<
    typeof replayPerformanceRequestSchema
>;

/**
 * Which calculator package a variant was built from. The osu packages have no equivalent type.
 */
export type CalculatorAlgorithm = "live" | "rebalance";

/**
 * The score values actually used in a calculation, after defaults, clamping, and replay analysis.
 */
export interface ResolvedScore {
    readonly n300: number;
    readonly n100: number;
    readonly n50: number;
    readonly nmiss: number;
    readonly combo: number;
    readonly sliderTicksMissed?: number;
    readonly sliderEndsDropped?: number;
    readonly totalScore?: number;
    readonly tapPenalty: number;
    readonly sliderCheesePenalty: number;
}

/**
 * Information derived from a replay. Not the replay analyzer's `ReplayInformation`, which is the raw replay record.
 */
export interface ReplayAttributes {
    readonly hitError: HitErrorInformation | null;
    readonly sliderTickInformation: SliderNestedHitObjectInformation | null;
    readonly sliderEndInformation: SliderNestedHitObjectInformation | null;
}

export interface InfoResponse {
    readonly id: string;
    readonly mode: Modes;
    readonly algorithm: CalculatorAlgorithm;
    readonly calculatorVersion: string;
    readonly builtAt: string;
}

export interface DifficultyResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
> {
    readonly difficulty: CacheableDifficultyAttributes<TAttributes>;

    /**
     * PNG image, base64-encoded.
     */
    readonly strainChart?: string;
}

export interface PerformanceResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> extends DifficultyResponse<TAttributes> {
    readonly performance: TPerformance;
    readonly score: ResolvedScore;
}

export interface ReplayPerformanceResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> extends PerformanceResponse<TAttributes, TPerformance> {
    readonly replay: ReplayAttributes;
}
