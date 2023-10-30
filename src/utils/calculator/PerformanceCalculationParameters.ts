import { Accuracy, MapStats, ModUtil } from "@rian8337/osu-base";
import { SliderCheeseInformation } from "@rian8337/osu-droid-replay-analyzer";
import { DifficultyCalculationParameters } from "./DifficultyCalculationParameters";
import { RawDifficultyAttributes } from "../../structures/attributes/RawDifficultyAttributes";
import { CloneablePerformanceCalculationParameters } from "./CloneablePerformanceCalculationParameters";
import {
    CacheableDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { PerformanceCalculationOptions as RebalancePerformanceCalculationOptions } from "@rian8337/osu-rebalance-difficulty-calculator";

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
        return new this(
            new Accuracy(data.accuracy),
            data.combo,
            data.tapPenalty,
            new MapStats({
                ...data.customStatistics,
                mods: ModUtil.pcStringToMods(data.customStatistics?.mods ?? ""),
            }),
            data.sliderCheesePenalty
        );
    }

    /**
     * The combo achieved.
     */
    combo?: number;

    /**
     * The accuracy achieved.
     */
    accuracy: Accuracy;

    /**
     * The tap penalty to apply for penalized scores.
     */
    tapPenalty: number;

    /**
     * The slider cheese penalties to apply for penalized scores.
     */
    sliderCheesePenalty?: SliderCheeseInformation;

    /**
     * @param accuracy The accuracy achieved.
     * @param combo The combo achieved.
     * @param tapPenalty The tap penalty to apply for penalized scores.
     * @param customStatistics The custom statistics that was used in difficulty calculation.
     * @param sliderCheesePenalty The slider cheese penalties to apply for penalized scores.
     */
    constructor(
        accuracy: Accuracy,
        combo?: number | null,
        tapPenalty: number = 1,
        customStatistics?: MapStats,
        sliderCheesePenalty?: SliderCheeseInformation
    ) {
        super(customStatistics);

        this.accuracy = accuracy;
        this.combo = combo ?? undefined;
        this.tapPenalty = tapPenalty;
        this.sliderCheesePenalty = sliderCheesePenalty;
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

        if (this.accuracy.n50 || this.accuracy.n100) {
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

    override toCloneable(): CloneablePerformanceCalculationParameters {
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
