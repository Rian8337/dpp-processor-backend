import type { ScoreParameters } from "@dpp/shared";
import {
    BeatmapDecoder,
    ModUtil,
    type Beatmap,
    type ModMap,
    type Modes,
    type PlayableBeatmap,
    type SerializedMod,
} from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
    DifficultyCalculator,
    DifficultyHitObject,
    IDifficultyAttributes,
    IPerformanceAttributes,
    PerformanceCalculationOptions,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { AlgorithmInputError } from "./errors";
import { resolveScore, toCalculationOptions } from "./score";
import type {
    Algorithm,
    PerformanceResult,
    ReplayAnalysis,
    ReplayHeader,
} from "./types";

/**
 * Difficulty attributes with the mods deserialized into a `ModMap`, as the replay analyzer expects.
 */
export type AnalyzerDifficultyAttributes<TAttributes extends IDifficultyAttributes> = Omit<
    TAttributes,
    "mods" | "toCacheableAttributes"
> & { mods: ModMap };

/**
 * Calculator logic shared by all modes.
 *
 * @template TAttributes The difficulty attributes the mode's difficulty calculator produces.
 * @template TPerformance The performance attributes the mode's performance calculator produces.
 */
export abstract class BaseAlgorithm<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
> implements Algorithm<TAttributes, TPerformance> {
    abstract readonly mode: Modes;

    protected abstract readonly difficultyCalculator: DifficultyCalculator<
        PlayableBeatmap,
        DifficultyHitObject,
        DifficultyAttributes & TAttributes
    >;

    /**
     * Runs the mode's performance calculator.
     */
    protected abstract calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        options: PerformanceCalculationOptions,
    ): TPerformance;

    decodeBeatmap(osuFile: string): Beatmap {
        let beatmap: Beatmap;

        try {
            beatmap = new BeatmapDecoder().decode(osuFile, this.mode).result;
        } catch (e) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                e instanceof Error ? e.message : "Beatmap could not be decoded",
            );
        }

        if (beatmap.hitObjects.objects.length === 0) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                "Beatmap has no hit objects",
            );
        }

        return beatmap;
    }

    retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[] {
        return ModUtil.serializeMods(
            this.difficultyCalculator.retainDifficultyAdjustmentMods([
                ...mods.values(),
            ]),
        );
    }

    calculateDifficulty(
        beatmap: Beatmap,
        mods: ModMap,
    ): CacheableDifficultyAttributes<TAttributes> {
        return this.difficultyCalculator
            .calculate(beatmap, mods)
            .toCacheableAttributes();
    }

    calculatePerformance(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        score: ScoreParameters,
    ): PerformanceResult<TPerformance> {
        // The attributes carry maxCombo and the object counts; droid attributes also carry maximumScore.
        const resolved = resolveScore(difficulty, score);

        return {
            performance: this.calculatePerformanceAttributes(
                difficulty,
                toCalculationOptions(resolved),
            ),
            score: resolved,
        };
    }

    calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks {
        return this.difficultyCalculator.calculateStrainPeaks(beatmap, mods);
    }

    async readReplay(replay: Buffer): Promise<ReplayHeader> {
        const data = await this.decodeReplay(new ReplayAnalyzer(), replay);

        return {
            beatmapHash: data.hash,
            mods: data.isReplayV3() ? data.convertedMods.serializeMods() : null,
        };
    }

    async analyzeReplay(
        replay: Buffer,
        beatmap: Beatmap,
        difficulty: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<ReplayAnalysis> {
        // The attributes must be set before any analysis: for replays that do not record their mods (v1/v2), hit
        // windows are taken from them.
        const attributes: AnalyzerDifficultyAttributes<TAttributes> = {
            ...difficulty,
            mods: ModUtil.deserializeMods(difficulty.mods),
        };
        const analyzer = this.createReplayAnalyzer(beatmap, attributes);
        const data = await this.decodeReplay(analyzer, replay);

        const score: ScoreParameters = {
            n300: data.accuracy.n300,
            n100: data.accuracy.n100,
            n50: data.accuracy.n50,
            nmiss: data.accuracy.nmiss,
        };

        if (data.isReplayV3()) {
            score.combo = data.maxCombo;
            score.totalScore = data.score;
        }

        const sliders = analyzer.obtainSliderHitInformation();

        if (sliders) {
            score.sliderTicksMissed =
                sliders.head.total -
                sliders.head.obtained +
                (sliders.tick.total - sliders.tick.obtained) +
                (sliders.repeat.total - sliders.repeat.obtained);
            score.sliderEndsDropped = sliders.end.total - sliders.end.obtained;
        }

        this.applyReplayPenalties(analyzer, attributes, score);

        return {
            score,
            replay: {
                hitError: analyzer.calculateHitError(),
                sliderTickInformation: sliders?.tick ?? null,
                sliderEndInformation: sliders?.end ?? null,
            },
        };
    }

    /**
     * Creates the analyzer for a replay of `beatmap`, with `attributes` (carrying the mods as a `ModMap`) set.
     */
    protected abstract createReplayAnalyzer(
        beatmap: Beatmap,
        attributes: AnalyzerDifficultyAttributes<TAttributes>,
    ): ReplayAnalyzer;

    /**
     * Applies mode-specific replay penalties to `score`. The default applies none.
     */
    protected applyReplayPenalties(
        _analyzer: ReplayAnalyzer,
        _attributes: AnalyzerDifficultyAttributes<TAttributes>,
        _score: ScoreParameters,
    ): void {
        // No penalties by default.
    }

    private async decodeReplay(analyzer: ReplayAnalyzer, replay: Buffer) {
        analyzer.originalODR = replay;
        await analyzer.analyze().catch(() => undefined);

        if (!analyzer.data) {
            throw new AlgorithmInputError(
                "INVALID_REPLAY",
                "Replay could not be decoded",
            );
        }

        return analyzer.data;
    }
}
