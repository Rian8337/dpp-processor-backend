import type {
    ReplayAttributes,
    ResolvedScore,
    ScoreParameters,
} from "@dpp/shared";
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
 * What can be read from a replay without its beatmap.
 */
export interface ReplayHeader {
    readonly beatmapHash: string;

    /**
     * The mods the replay was played with, or `null` for replays older than v3, which don't record them.
     */
    readonly mods: SerializedMod[] | null;
}

/**
 * Score values and attributes derived from a replay.
 */
export interface ReplayAnalysis {
    readonly score: ScoreParameters;
    readonly replay: ReplayAttributes;
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

    /**
     * Reads a replay's beatmap hash and mods.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REPLAY` if the replay cannot be decoded.
     */
    readReplay(replay: Buffer): Promise<ReplayHeader>;

    /**
     * Derives score values (hit counts, combo, total score, slider values, penalties) and replay attributes.
     * `difficulty.mods` must be the mods the score is calculated with.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REPLAY` if the replay cannot be decoded.
     */
    analyzeReplay(
        replay: Buffer,
        beatmap: Beatmap,
        difficulty: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<ReplayAnalysis>;
}
