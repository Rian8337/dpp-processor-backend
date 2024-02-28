import { Accuracy, ModUtil } from "@rian8337/osu-base";
import {
    ReplayAnalyzer,
    SliderCheeseInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";
import { CloneablePerformanceCalculationParameters } from "./CloneablePerformanceCalculationParameters";
import {
    CacheableDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { PerformanceCalculationOptions as RebalancePerformanceCalculationOptions } from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    DifficultyCalculationParameters,
    DifficultyCalculationParametersInit,
} from "./DifficultyCalculationParameters";

/**
 * Represents a parameter to alter performance calculation result.
 */
export interface PerformanceCalculationParametersInit
    extends DifficultyCalculationParametersInit {
    /**
     * The combo achieved. Defaults to the beatmap's maximum combo.
     */
    combo: number;

    /**
     * The accuracy achieved. Defaults to SS.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

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
        data: CloneablePerformanceCalculationParameters
    ): PerformanceCalculationParameters {
        return new this({
            ...data,
            accuracy: new Accuracy(data.accuracy),
            mods: ModUtil.pcStringToMods(data.mods),
        });
    }

    /**
     * The combo achieved.
     */
    combo: number;

    /**
     * The accuracy achieved.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores. Defaults to 1.
     */
    tapPenalty?: number;

    /**
     * The slider cheese penalties to apply for penalized scores. Each of them defaults to 1.
     */
    sliderCheesePenalty?: SliderCheeseInformation;

    constructor(values: PerformanceCalculationParametersInit) {
        super(values);

        this.combo = values.combo;
        this.accuracy = values.accuracy;
        this.tapPenalty = values.tapPenalty;
        this.sliderCheesePenalty = values.sliderCheesePenalty;
    }

    /**
     * Applies difficulty attributes to alter this parameter.
     *
     * @param attributes The difficulty attributes.
     */
    applyFromAttributes(
        attributes:
            | CacheableDifficultyAttributes<RawDifficultyAttributes>
            | RawDifficultyAttributes
    ): void {
        const objectCount =
            attributes.hitCircleCount +
            attributes.sliderCount +
            attributes.spinnerCount;

        if (this.accuracy && (this.accuracy.n50 || this.accuracy.n100)) {
            this.accuracy = new Accuracy({
                ...this.accuracy,
                // Add remaining objects as misses.
                nmiss: Math.max(
                    0,
                    objectCount -
                        this.accuracy.n300 -
                        this.accuracy.n100 -
                        this.accuracy.n50
                ),
            });
        }
    }

    override applyReplay(replay: ReplayAnalyzer) {
        super.applyReplay(replay);

        const { data } = replay;

        if (data) {
            this.accuracy = new Accuracy(data.accuracy);
            this.combo = data.maxCombo;
        }

        this.tapPenalty = replay.tapPenalty;
        this.sliderCheesePenalty = replay.sliderCheesePenalty;
    }

    /**
     * Applies this calculation parameters to a calculation options.
     *
     * @param options The options to apply to.
     */
    applyToOptions(
        options:
            | PerformanceCalculationOptions
            | RebalancePerformanceCalculationOptions
    ): void {
        options.combo = this.combo;
        options.accPercent = this.accuracy;
        options.tapPenalty = this.tapPenalty;
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
    toCloneable(): CloneablePerformanceCalculationParameters {
        return {
            ...super.toCloneable(),
            accuracy: {
                ...this.accuracy,
            },
            combo: this.combo,
            tapPenalty: this.tapPenalty,
            sliderCheesePenalty: this.sliderCheesePenalty,
        };
    }
}
