import type { SliderObjectCounts } from "@/algorithms/sliderHits";
import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type { SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";

/**
 * Runs heavy calculations without blocking request handling. Disposing waits for running tasks to finish, then
 * releases resources.
 *
 * Methods throw API errors: `UnprocessableEntityError` for invalid input, `CalculationFailedError` for calculator
 * failures, and `ServiceUnavailableError` (`OVERLOADED`) when the queue is full.
 */
export interface ICalculationRunner extends AsyncDisposable {
    calculateDifficulty(input: {
        beatmapHash: string;
        osuFile: string;
        mods: SerializedMod[];
    }): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>>;

    /**
     * Counts the beatmap's sliders, slider ticks, slider repeats, and slider ends, as decoded in this mode.
     */
    countSliderObjects(input: {
        beatmapHash: string;
        osuFile: string;
    }): Promise<SliderObjectCounts>;

    readReplay(replay: Buffer): Promise<ReplayHeader>;

    analyzeReplay(input: {
        beatmapHash: string;
        osuFile: string;
        replay: Buffer;
        difficulty: CacheableDifficultyAttributes<IDifficultyAttributes>;
    }): Promise<ReplayAnalysis>;

    renderStrainChart(input: {
        beatmapHash: string;
        osuFile: string;
        mods: SerializedMod[];
        clockRate: number;
        color: string;
    }): Promise<Buffer>;
}
