import { Beatmap, Mod, Modes } from "@rian8337/osu-base";
import {
    ExtendedDroidDifficultyAttributes,
    DroidPerformanceCalculator,
    OsuDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
    DroidDifficultyCalculator,
    OsuDifficultyCalculator,
    IExtendedDroidDifficultyAttributes,
    IOsuDifficultyAttributes,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
    ExtendedDroidDifficultyAttributes as RebalanceExtendedDroidDifficultyAttributes,
    IExtendedDroidDifficultyAttributes as IRebalanceExtendedDroidDifficultyAttributes,
    IOsuDifficultyAttributes as IRebalanceOsuDifficultyAttributes,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
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
    mods: Mod[],
    mode: Modes.droid,
    method: PPCalculationMethod.live,
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
    mods: Mod[],
    mode: Modes.osu,
    method: PPCalculationMethod.live,
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
    mods: Mod[],
    mode: Modes.droid,
    method: PPCalculationMethod.rebalance,
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
    mods: Mod[],
    mode: Modes.osu,
    method: PPCalculationMethod.rebalance,
): RebalanceOsuDifficultyAttributes;

export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    mods: Mod[],
    mode: Modes,
    method: PPCalculationMethod,
):
    | ExtendedDroidDifficultyAttributes
    | OsuDifficultyAttributes
    | RebalanceExtendedDroidDifficultyAttributes
    | RebalanceOsuDifficultyAttributes {
    if (mode === Modes.droid) {
        switch (method) {
            case PPCalculationMethod.live:
                return new DroidDifficultyCalculator().calculate(beatmap, mods);

            case PPCalculationMethod.rebalance:
                return new RebalanceDroidDifficultyCalculator().calculate(
                    beatmap,
                    mods,
                );
        }
    } else {
        switch (method) {
            case PPCalculationMethod.live:
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
    mods: Mod[],
    mode: Modes,
    method: PPCalculationMethod,
): StrainPeaks {
    if (mode === Modes.droid) {
        switch (method) {
            case PPCalculationMethod.live:
                return new DroidDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );

            case PPCalculationMethod.rebalance:
                return new RebalanceDroidDifficultyCalculator().calculateStrainPeaks(
                    beatmap,
                    mods,
                );
        }
    } else {
        switch (method) {
            case PPCalculationMethod.live:
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
    mode: Modes.droid,
    method: PPCalculationMethod.live,
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
    mode: Modes.droid,
    method: PPCalculationMethod.rebalance,
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
    mode: Modes.osu,
    method: PPCalculationMethod.live,
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
    mode: Modes.osu,
    method: PPCalculationMethod.rebalance,
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

    if (mode === Modes.droid) {
        switch (method) {
            case PPCalculationMethod.live:
                return new DroidPerformanceCalculator(
                    attributes as IExtendedDroidDifficultyAttributes,
                ).calculate(calculationOptions);

            case PPCalculationMethod.rebalance:
                return new RebalanceDroidPerformanceCalculator(
                    attributes as IRebalanceExtendedDroidDifficultyAttributes,
                ).calculate(calculationOptions);
        }
    } else {
        switch (method) {
            case PPCalculationMethod.live:
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
