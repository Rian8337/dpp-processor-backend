import { Beatmap, Modes, ModMap } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes,
    IExtendedDroidDifficultyAttributes,
    IOsuDifficultyAttributes,
    OsuDifficultyAttributes,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";
import {
    IExtendedDroidDifficultyAttributes as IRebalanceExtendedDroidDifficultyAttributes,
    IOsuDifficultyAttributes as IRebalanceOsuDifficultyAttributes,
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
    OsuDifficultyCalculator as RebalanceOsuDifficultyCalculator,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param mods The mods to calculate for.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The attributes of the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes.Droid,
    method: PPCalculationMethod.Live,
): ExtendedDroidDifficultyAttributes;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param mods The mods to calculate for.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The attributes of the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes.Osu,
    method: PPCalculationMethod.Live,
): OsuDifficultyAttributes;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param mods The mods to calculate for.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The attributes of the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes.Droid,
    method: PPCalculationMethod.Rebalance,
): RebalanceExtendedDroidDifficultyAttributes;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param mods The mods to calculate for.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The attributes of the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes.Osu,
    method: PPCalculationMethod.Rebalance,
): RebalanceOsuDifficultyAttributes;

export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes,
    method: PPCalculationMethod,
):
    | ExtendedDroidDifficultyAttributes
    | OsuDifficultyAttributes
    | RebalanceExtendedDroidDifficultyAttributes
    | RebalanceOsuDifficultyAttributes {
    if (mode === Modes.Droid) {
        switch (method) {
            case PPCalculationMethod.Live:
                return new DroidDifficultyCalculator().calculate(beatmap, mods);

            case PPCalculationMethod.Rebalance:
                return new RebalanceDroidDifficultyCalculator().calculate(
                    beatmap,
                    mods,
                );
        }
    } else {
        switch (method) {
            case PPCalculationMethod.Live:
                return new OsuDifficultyCalculator().calculate(beatmap, mods);

            default:
                return new RebalanceOsuDifficultyCalculator().calculate(
                    beatmap,
                    mods,
                );
        }
    }
}

/**
 * Calculates the strain peaks of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param mods The mods to calculate for.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The strain peaks of the beatmap.
 */
export function getStrainPeaks(
    beatmap: Beatmap,
    mods: ModMap,
    mode: Modes,
    method: PPCalculationMethod,
): StrainPeaks {
    if (mode === Modes.Droid) {
        switch (method) {
            case PPCalculationMethod.Live:
                return new DroidDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );

            case PPCalculationMethod.Rebalance:
                return new RebalanceDroidDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );
        }
    } else {
        switch (method) {
            case PPCalculationMethod.Live:
                return new OsuDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );

            default:
                return new RebalanceOsuDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );
        }
    }
}

/**
 * Calculates the performance of a beatmap.
 *
 * @param attributes The attributes of the beatmap.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    attributes: IExtendedDroidDifficultyAttributes,
    calculationParams: PerformanceCalculationParameters,
    mode: Modes.Droid,
    method: PPCalculationMethod.Live,
): DroidPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param attributes The attributes of the beatmap.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    attributes: IRebalanceExtendedDroidDifficultyAttributes,
    calculationParams: PerformanceCalculationParameters,
    mode: Modes.Droid,
    method: PPCalculationMethod.Rebalance,
): RebalanceDroidPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param attributes The attributes of the beatmap.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    attributes: IOsuDifficultyAttributes,
    calculationParams: PerformanceCalculationParameters,
    mode: Modes.Osu,
    method: PPCalculationMethod.Live,
): OsuPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param attributes The attributes of the beatmap.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    attributes: IRebalanceOsuDifficultyAttributes,
    calculationParams: PerformanceCalculationParameters,
    mode: Modes.Osu,
    method: PPCalculationMethod.Rebalance,
): RebalanceOsuPerformanceCalculator;

export function calculateLocalBeatmapPerformance(
    attributes:
        | IExtendedDroidDifficultyAttributes
        | IRebalanceExtendedDroidDifficultyAttributes
        | IOsuDifficultyAttributes
        | IRebalanceOsuDifficultyAttributes,
    calculationParams: PerformanceCalculationParameters,
    mode: Modes,
    method: PPCalculationMethod,
):
    | DroidPerformanceCalculator
    | RebalanceDroidPerformanceCalculator
    | OsuPerformanceCalculator
    | RebalanceOsuPerformanceCalculator {
    calculationParams.applyFromAttributes(attributes);

    const calculationOptions: PerformanceCalculationOptions = {
        combo: calculationParams.combo,
        accPercent: calculationParams.accuracy,
        tapPenalty: calculationParams.tapPenalty,
    };

    if (mode === Modes.Droid) {
        switch (method) {
            case PPCalculationMethod.Live:
                return new DroidPerformanceCalculator(
                    attributes as IExtendedDroidDifficultyAttributes,
                ).calculate(calculationOptions);

            case PPCalculationMethod.Rebalance:
                return new RebalanceDroidPerformanceCalculator(
                    attributes as IRebalanceExtendedDroidDifficultyAttributes,
                ).calculate(calculationOptions);
        }
    } else {
        switch (method) {
            case PPCalculationMethod.Live:
                return new OsuPerformanceCalculator(
                    attributes as IOsuDifficultyAttributes,
                ).calculate(calculationOptions);

            default:
                return new RebalanceOsuPerformanceCalculator(
                    attributes as IRebalanceOsuDifficultyAttributes,
                ).calculate(calculationOptions);
        }
    }
}
