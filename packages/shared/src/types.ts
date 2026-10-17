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

/**
 * A variant as the broker describes it to clients.
 */
export interface VariantSummary {
    /**
     * The variant name, also when the variant was looked up by alias.
     */
    readonly name: string;

    /**
     * A short display name, or `null` if the variant has none.
     */
    readonly title: string | null;
    readonly aliases: readonly string[];
    readonly description: string | null;

    /**
     * Whether at least one of the variant's processor instances is healthy.
     */
    readonly available: boolean;

    /**
     * From the latest successful `GET /info` of any instance; `null` if none has succeeded since the broker started.
     */
    readonly mode: Modes | null;
    readonly algorithm: CalculatorAlgorithm | null;
    readonly calculatorVersion: string | null;
    readonly builtAt: string | null;
}

/**
 * What a user may do in the variant management API: `admin` manages everything, `manager` manages granted variants.
 */
export type UserRole = "admin" | "manager";

/**
 * The caller's identity and permissions, from `GET /admin/me`.
 */
export interface MeResponse {
    readonly uid: number;

    /**
     * `null` if the user has no role.
     */
    readonly role: UserRole | null;

    /**
     * Names of the variants the user manages.
     */
    readonly grants: string[];
}

/**
 * A variant as the management API describes it.
 */
export interface AdminVariant extends VariantSummary {
    readonly public: boolean;
    readonly instanceCount: number;
}

/**
 * An API key as the management API describes it. Never includes the raw key.
 */
export interface AdminKey {
    readonly name: string;
    readonly rateLimitPerMinute: number | null;
    readonly allVariants: boolean;
    readonly canActForUsers: boolean;

    /**
     * Names of the variants the key may use.
     */
    readonly grants: string[];

    /**
     * ISO 8601.
     */
    readonly createdAt: string;

    /**
     * ISO 8601; `null` if the key is active.
     */
    readonly revokedAt: string | null;
}

/**
 * A user as the management API describes it.
 */
export interface AdminUser {
    readonly uid: number;
    readonly role: UserRole | null;

    /**
     * Names of the variants the user manages.
     */
    readonly grants: string[];
}

/**
 * The response to creating a key: the only time the raw key is shown.
 */
export interface CreatedKeyResponse {
    readonly key: AdminKey;
    readonly rawKey: string;
}
