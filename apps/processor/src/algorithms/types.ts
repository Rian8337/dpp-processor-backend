import type { ResolvedScore, ScoreParameters } from "@dpp/shared";
import type { Beatmap, ModMap, Modes, SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
    IPerformanceAttributes,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";

/**
 * The result of a performance calculation.
 */
export interface PerformanceResult<
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> {
    readonly performance: TPerformance;
    readonly score: ResolvedScore;
}

/**
 * The only code that calls the calculator packages. One implementation exists per game mode; which calculator
 * code runs is decided when the variant is built.
 */
export interface Algorithm<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> {
    /**
     * The game mode this algorithm calculates for.
     */
    readonly mode: Modes;

    /**
     * Decodes a `.osu` file for this mode.
     *
     * @throws {AlgorithmInputError} With code `INVALID_BEATMAP` if the file cannot be decoded or has no hit objects.
     */
    decodeBeatmap(osuFile: string): Beatmap;

    /**
     * Keeps only the mods that affect difficulty, in serialized form.
     */
    retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[];

    /**
     * Calculates cacheable difficulty attributes.
     */
    calculateDifficulty(
        beatmap: Beatmap,
        mods: ModMap,
    ): CacheableDifficultyAttributes<TAttributes>;

    /**
     * Calculates performance from difficulty attributes. `difficulty.mods` must be the mods the score was played
     * with, since some mods (such as NoFail) change performance without changing difficulty.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REQUEST` if the hit counts exceed the object count.
     */
    calculatePerformance(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        score: ScoreParameters,
    ): PerformanceResult<TPerformance>;

    /**
     * Calculates strain peaks for strain chart rendering.
     */
    calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks;
}
