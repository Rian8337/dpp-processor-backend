import { IScore } from "@/database/official/schema";
import {
    Accuracy,
    IBeatmap,
    MathUtils,
    ModMap,
    ModUtil,
} from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    ReplayAnalyzer,
    SliderCheeseInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import { PerformanceCalculationOptions as RebalancePerformanceCalculationOptions } from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    CalculationParametersInit,
    CloneableCalculationParameters,
    RawDifficultyAttributes,
} from "@/types";

/**
 * Represents a parameter to alter a calculation's result.
 */
export class CalculationParameters {
    /**
     * Constructs a `PerformanceCalculationParameters` object from raw data.
     *
     * @param data The data.
     */
    static from(data: CloneableCalculationParameters): CalculationParameters {
        return new this({
            ...data,
            accuracy: new Accuracy(data.accuracy),
            mods: ModUtil.deserializeMods(data.mods),
        });
    }

    /**
     * The mods to calculate for.
     */
    mods: ModMap;

    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

    /**
     * The amount of slider ticks that were missed.
     */
    sliderTicksMissed?: number;

    /**
     * The amount of slider ends that were dropped.
     */
    sliderEndsDropped?: number;

    /**
     * The slider cheese penalties to apply for penalized scores. Each of them defaults to 1.
     */
    sliderCheesePenalty?: SliderCheeseInformation;

    constructor(values?: CalculationParametersInit) {
        this.mods = values?.mods ?? new ModMap();
        this.combo = values?.combo;

        this.accuracy =
            values?.accuracy ??
            new Accuracy({
                n300: 1,
                n100: 0,
                n50: 0,
                nmiss: 0,
            });

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
    ) {
        const objectCount =
            attributes.hitCircleCount +
            attributes.sliderCount +
            attributes.spinnerCount;

        const accuracyObjectCount =
            // n300 is -1 by default.
            Math.max(0, this.accuracy.n300) +
            this.accuracy.n100 +
            this.accuracy.n50 +
            this.accuracy.nmiss;

        // Ensure accuracy is within possible bounds.
        if (accuracyObjectCount !== objectCount) {
            let diff = objectCount - accuracyObjectCount;

            if (diff > 0) {
                // Add remaining objects as 300s, but ensure it is not -1 first.
                this.accuracy.n300 = Math.max(0, this.accuracy.n300);
                this.accuracy.n300 += diff;
            } else {
                // Remove excess objects from existing hits until we reach the desired count.
                // Start from misses to be more inline with user expectations.
                const nmiss = Math.max(0, this.accuracy.nmiss + diff);
                diff -= this.accuracy.nmiss - nmiss;
                this.accuracy.nmiss = nmiss;

                const n50 = Math.max(0, this.accuracy.n50 + diff);
                diff -= this.accuracy.n50 - n50;
                this.accuracy.n50 = n50;

                const n100 = Math.max(0, this.accuracy.n100 + diff);
                diff -= this.accuracy.n100 - n100;
                this.accuracy.n100 = n100;

                this.accuracy.n300 = Math.max(0, this.accuracy.n300 + diff);
            }
        }

        // Ensure combo is within possible bounds.
        if (this.combo !== undefined) {
            this.combo = MathUtils.clamp(this.combo, 0, attributes.maxCombo);
        }
    }

    /**
     * Applies a replay to this parameter.
     *
     * @param replay The replay.
     */
    applyReplay(replay: ReplayAnalyzer) {
        const { data } = replay;

        if (data !== null) {
            this.accuracy = new Accuracy(data.accuracy);

            if (data.isReplayV3()) {
                this.mods = data.convertedMods;
                this.combo = data.maxCombo;
            }

            if (replay.beatmap) {
                const { tick, end } = replay.obtainSliderHitInformation()!;

                this.sliderTicksMissed = tick.obtained;
                this.sliderEndsDropped = end.obtained;
            }
        }

        this.tapPenalty = replay.tapPenalty;
        this.sliderCheesePenalty = replay.sliderCheesePenalty;
    }

    /**
     * Applies a score to this parameter.
     *
     * @param beatmap The beatmap to apply the score to.
     * @param score The score.
     */
    applyScore(
        beatmap: IBeatmap,
        score:
            | Score
            | Pick<
                  IScore,
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
        this.mods =
            score instanceof Score
                ? score.mods
                : ModUtil.deserializeMods(score.mods);

        this.combo = score.combo;

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

        const sliderTickHits =
            score instanceof Score ? score.sliderTickHits : score.sliderTickHit;

        if (sliderTickHits !== null) {
            this.sliderTicksMissed =
                beatmap.hitObjects.sliderTicks - sliderTickHits;
        }

        const sliderEndHits =
            score instanceof Score ? score.sliderEndHits : score.sliderEndHit;

        if (sliderEndHits !== null) {
            this.sliderEndsDropped = beatmap.hitObjects.sliders - sliderEndHits;
        }
    }

    /**
     * Applies this calculation parameters to a calculation options.
     *
     * @param options The options to apply to.
     */
    applyToOptions(
        options:
            | PerformanceCalculationOptions
            | RebalancePerformanceCalculationOptions,
    ) {
        options.combo = this.combo;
        options.accPercent = this.accuracy;
        options.tapPenalty = this.tapPenalty;
        options.sliderTicksMissed = this.sliderTicksMissed;
        options.sliderEndsDropped = this.sliderEndsDropped;
        options.aimSliderCheesePenalty =
            this.sliderCheesePenalty?.aimPenalty ?? 1;
        options.flashlightSliderCheesePenalty =
            this.sliderCheesePenalty?.flashlightPenalty ?? 1;
        options.visualSliderCheesePenalty =
            this.sliderCheesePenalty?.visualPenalty ?? 1;
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    toCloneable(): CloneableCalculationParameters {
        return {
            mods: this.mods.serializeMods(),
            accuracy: {
                n300: this.accuracy.n300,
                n100: this.accuracy.n100,
                n50: this.accuracy.n50,
                nmiss: this.accuracy.nmiss,
            },
            combo: this.combo,
            sliderTickHits: this.sliderTicksMissed,
            sliderEndHits: this.sliderEndsDropped,
            tapPenalty: this.tapPenalty,
            sliderCheesePenalty: this.sliderCheesePenalty,
        };
    }
}
