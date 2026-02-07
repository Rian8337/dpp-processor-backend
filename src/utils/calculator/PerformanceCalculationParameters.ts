import { Accuracy, IBeatmap, ModMap, ModUtil } from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    ReplayAnalyzer,
    SliderCheeseInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import {
    IDroidDifficultyAttributes,
    PerformanceCalculationOptions as RebalancePerformanceCalculationOptions,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";
import { CloneablePerformanceCalculationParameters } from "./CloneablePerformanceCalculationParameters";
import { DifficultyCalculationParameters } from "./DifficultyCalculationParameters";
import { Score } from "@rian8337/osu-droid-utilities";
import { scoresTable } from "../../database/official/schema";
import { obtainTickInformation } from "../replayManager";

/**
 * Represents a parameter to alter performance calculation result.
 */
export interface PerformanceCalculationParametersInit {
    /**
     * The mods to calculate for.
     */
    mods?: ModMap;

    /**
     * The total score achieved.
     */
    totalScore?: number;

    /**
     * The combo achieved. Defaults to the beatmap's maximum combo.
     */
    combo?: number;

    /**
     * The accuracy achieved. Defaults to SS.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

    /**
     * The number of slider ticks that were hit.
     *
     * If {@link sliderTicksMissed} is defined, this value will be ignored.
     */
    sliderTickHits?: number;

    /**
     * The number of slider ticks that were missed.
     */
    sliderTicksMissed?: number;

    /**
     * The number of slider ends that were hit.
     *
     * If {@link sliderEndsDropped} is defined, this value will be ignored.
     */
    sliderEndHits?: number;

    /**
     * The number of slider ends that were dropped.
     */
    sliderEndsDropped?: number;

    /**
     * The slider cheese penalties to apply for penalized scores. Each of them defaults to 1.
     */
    sliderCheesePenalty?: SliderCheeseInformation;
}

/**
 * Represents a parameter to alter performance calculation result.
 */
export class PerformanceCalculationParameters extends DifficultyCalculationParameters {
    /**
     * Constructs a `PerformanceCalculationParameters` object from raw data.
     *
     * @param data The data.
     */
    static from(
        data: CloneablePerformanceCalculationParameters,
    ): PerformanceCalculationParameters {
        return new this({
            ...data,
            accuracy: new Accuracy(data.accuracy),
            mods: ModUtil.deserializeMods(data.mods),
        });
    }

    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The total score achieved.
     */
    totalScore?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

    /**
     * The number of slider ticks that were hit.
     *
     * If {@link sliderTicksMissed} is defined, this value will be ignored.
     */
    sliderTickHits?: number;

    /**
     * The number of slider ticks that were missed.
     */
    sliderTicksMissed?: number;

    /**
     * The number of slider ends that were hit.
     *
     * If {@link sliderEndsDropped} is defined, this value will be ignored.
     */
    sliderEndHits?: number;

    /**
     * The number of slider ends that were dropped.
     */
    sliderEndsDropped?: number;

    /**
     * The slider cheese penalties to apply for penalized scores. Each of them defaults to 1.
     */
    sliderCheesePenalty?: SliderCheeseInformation;

    constructor(values?: PerformanceCalculationParametersInit) {
        super(values?.mods);

        this.combo = values?.combo;
        this.totalScore = values?.totalScore;

        this.accuracy =
            values?.accuracy ??
            new Accuracy({
                n300: 1,
                n100: 0,
                n50: 0,
                nmiss: 0,
            });

        this.sliderTickHits = values?.sliderTickHits;
        this.sliderEndHits = values?.sliderEndHits;
        this.sliderTicksMissed = values?.sliderTicksMissed;
        this.sliderEndsDropped = values?.sliderEndsDropped;
        this.tapPenalty = values?.tapPenalty;
        this.sliderCheesePenalty = values?.sliderCheesePenalty;
    }

    /**
     * Applies difficulty attributes to alter this parameter.
     *
     * @param attributes The difficulty attributes.
     */
    applyFromAttributes(
        attributes:
            | CacheableDifficultyAttributes<RawDifficultyAttributes>
            | RawDifficultyAttributes,
    ): void {
        const objectCount =
            attributes.hitCircleCount +
            attributes.sliderCount +
            attributes.spinnerCount;

        if (this.accuracy.n50 || this.accuracy.n100) {
            this.accuracy = new Accuracy({
                ...this.accuracy,
                // Add remaining objects as misses.
                nmiss: Math.max(
                    0,
                    objectCount -
                        this.accuracy.n300 -
                        this.accuracy.n100 -
                        this.accuracy.n50,
                ),
            });
        }

        const maxScore = (attributes as IDroidDifficultyAttributes | undefined)
            ?.maximumScore;

        if (maxScore !== undefined && this.totalScore !== undefined) {
            this.totalScore = Math.min(this.totalScore, maxScore);
        }
    }

    override applyReplay(replay: ReplayAnalyzer) {
        super.applyReplay(replay);

        const { data } = replay;

        if (data) {
            this.accuracy = new Accuracy(data.accuracy);

            if (data.isReplayV3()) {
                this.combo = data.maxCombo;
                this.totalScore = data.score;
            }

            if (replay.beatmap) {
                const { tick, end } = obtainTickInformation(
                    replay.beatmap,
                    data,
                );

                this.sliderTicksMissed = tick.total - tick.obtained;
                this.sliderEndsDropped = end.total - end.obtained;
            }
        }

        this.tapPenalty = replay.tapPenalty;
        this.sliderCheesePenalty = replay.sliderCheesePenalty;
    }

    override applyScore(
        score:
            | Score
            | Pick<
                  typeof scoresTable.$inferSelect,
                  | "score"
                  | "mods"
                  | "combo"
                  | "perfect"
                  | "good"
                  | "bad"
                  | "miss"
                  | "sliderTickHit"
                  | "sliderEndHit"
              >,
    ) {
        super.applyScore(score);

        this.combo = score.combo;
        this.totalScore = score.score;

        this.accuracy = new Accuracy(
            score instanceof Score
                ? score.accuracy
                : {
                      n300: score.perfect,
                      n100: score.good,
                      n50: score.bad,
                      nmiss: score.miss,
                  },
        );

        this.sliderTickHits =
            (score instanceof Score
                ? score.sliderTickHits
                : score.sliderTickHit) ?? undefined;

        this.sliderEndHits =
            (score instanceof Score
                ? score.sliderEndHits
                : score.sliderEndHit) ?? undefined;
    }

    /**
     * Applies this calculation parameters to a calculation options.
     *
     * @param options The options to apply to.
     */
    applyToOptions(
        beatmap: IBeatmap,
        options:
            | PerformanceCalculationOptions
            | RebalancePerformanceCalculationOptions,
    ): void {
        options.combo = this.combo;
        options.accPercent = this.accuracy;
        options.tapPenalty = this.tapPenalty;
        options.aimSliderCheesePenalty =
            this.sliderCheesePenalty?.aimPenalty ?? 1;
        (
            options as PerformanceCalculationOptions
        ).flashlightSliderCheesePenalty =
            this.sliderCheesePenalty?.flashlightPenalty ?? 1;

        if (this.sliderTicksMissed !== undefined) {
            options.sliderTicksMissed = this.sliderTicksMissed;
        } else if (this.sliderTickHits !== undefined) {
            options.sliderTicksMissed =
                beatmap.hitObjects.sliderTicks - this.sliderTickHits;
        }

        if (this.sliderEndsDropped !== undefined) {
            options.sliderEndsDropped = this.sliderEndsDropped;
        } else if (this.sliderEndHits !== undefined) {
            options.sliderEndsDropped =
                beatmap.hitObjects.sliders - this.sliderEndHits;
        }

        (options as RebalancePerformanceCalculationOptions).totalScore =
            this.totalScore;
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    override toCloneable(): CloneablePerformanceCalculationParameters {
        return {
            ...super.toCloneable(),
            accuracy: { ...this.accuracy },
            combo: this.combo,
            sliderTickHits: this.sliderTickHits,
            sliderEndHits: this.sliderEndHits,
            sliderTicksMissed: this.sliderTicksMissed,
            sliderEndsDropped: this.sliderEndsDropped,
            tapPenalty: this.tapPenalty,
            sliderCheesePenalty: this.sliderCheesePenalty,
            totalScore: this.totalScore,
        };
    }
}
