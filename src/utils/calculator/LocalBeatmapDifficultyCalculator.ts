import { Beatmap, ModDifficultyAdjust, Modes } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyCalculationOptions,
    DroidDifficultyCalculator as RebalanceDroidDifficultyCalculator,
    DroidPerformanceCalculator as RebalanceDroidPerformanceCalculator,
    OsuDifficultyCalculator as RebalanceOsuDifficultyCalculator,
    OsuPerformanceCalculator as RebalanceOsuPerformanceCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../../structures/PPCalculationMethod";
import { DifficultyCalculationParameters } from "./DifficultyCalculationParameters";
import { PerformanceCalculationParameters } from "./PerformanceCalculationParameters";

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The calculator instance that calculated the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    calculationParams: DifficultyCalculationParameters,
    mode: Modes.droid,
    method: PPCalculationMethod.live,
): DroidDifficultyCalculator;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The calculator instance that calculated the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    calculationParams: DifficultyCalculationParameters,
    mode: Modes.osu,
    method: PPCalculationMethod.live,
): OsuDifficultyCalculator;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The calculator instance that calculated the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    calculationParams: DifficultyCalculationParameters,
    mode: Modes.droid,
    method: PPCalculationMethod.rebalance,
): RebalanceDroidDifficultyCalculator;

/**
 * Calculates the difficulty of a beatmap.
 *
 * @param beatmap The beatmap to calculate.
 * @param calculationParams The calculation parameters.
 * @param mode The gamemode to calculate.
 * @param method The calculation method to use.
 * @returns The calculator instance that calculated the beatmap.
 */
export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    calculationParams: DifficultyCalculationParameters,
    mode: Modes.osu,
    method: PPCalculationMethod.rebalance,
): RebalanceOsuDifficultyCalculator;

export function calculateLocalBeatmapDifficulty(
    beatmap: Beatmap,
    calculationParams: DifficultyCalculationParameters,
    mode: Modes,
    method: PPCalculationMethod,
):
    | DroidDifficultyCalculator
    | OsuDifficultyCalculator
    | RebalanceDroidDifficultyCalculator
    | RebalanceOsuDifficultyCalculator {
    const {
        customSpeedMultiplier,
        forceCS,
        forceAR,
        forceOD,
        forceHP,
        oldStatistics,
    } = calculationParams;
    const mods = calculationParams.mods.slice();

    if ([forceCS, forceAR, forceOD, forceHP].some((v) => v !== undefined)) {
        mods.push(
            new ModDifficultyAdjust({
                cs: forceCS,
                ar: forceAR,
                od: forceOD,
                hp: forceHP,
            }),
        );
    }

    const calculationOptions: DroidDifficultyCalculationOptions = {
        mods: mods,
        customSpeedMultiplier: customSpeedMultiplier,
        oldStatistics: oldStatistics,
    };

    if (mode === Modes.droid) {
        switch (method) {
            case PPCalculationMethod.live:
                return new DroidDifficultyCalculator(beatmap).calculate(
                    calculationOptions,
                );
            case PPCalculationMethod.rebalance:
                return new RebalanceDroidDifficultyCalculator(
                    beatmap,
                ).calculate(calculationOptions);
        }
    } else {
        switch (method) {
            case PPCalculationMethod.rebalance:
                return new RebalanceOsuDifficultyCalculator(beatmap).calculate(
                    calculationOptions,
                );
            default:
                return new OsuDifficultyCalculator(beatmap).calculate(
                    calculationOptions,
                );
        }
    }
}

/**
 * Calculates the performance of a beatmap.
 *
 * @param calculator The difficulty calculator that calculates the beatmap.
 * @param calculationParams The calculation parameters.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    calculator: DroidDifficultyCalculator,
    calculationParams: PerformanceCalculationParameters,
): DroidPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param calculator The difficulty calculator that calculates the beatmap.
 * @param calculationParams The calculation parameters.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    calculator: RebalanceDroidDifficultyCalculator,
    calculationParams: PerformanceCalculationParameters,
): RebalanceDroidPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param calculator The difficulty calculator that calculates the beatmap.
 * @param calculationParams The calculation parameters.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    calculator: OsuDifficultyCalculator,
    calculationParams: PerformanceCalculationParameters,
): OsuPerformanceCalculator;

/**
 * Calculates the performance of a beatmap.
 *
 * @param calculator The difficulty calculator that calculates the beatmap.
 * @param calculationParams The calculation parameters.
 * @returns The performance calculator instance.
 */
export function calculateLocalBeatmapPerformance(
    calculator: RebalanceOsuDifficultyCalculator,
    calculationParams: PerformanceCalculationParameters,
): RebalanceOsuPerformanceCalculator;

export function calculateLocalBeatmapPerformance(
    calculator:
        | DroidDifficultyCalculator
        | RebalanceDroidDifficultyCalculator
        | OsuDifficultyCalculator
        | RebalanceOsuDifficultyCalculator,
    calculationParams: PerformanceCalculationParameters,
):
    | DroidPerformanceCalculator
    | RebalanceDroidPerformanceCalculator
    | OsuPerformanceCalculator
    | RebalanceOsuPerformanceCalculator {
    calculationParams.applyFromAttributes(calculator.attributes);

    const calculationOptions: PerformanceCalculationOptions = {
        combo: calculationParams.combo,
        accPercent: calculationParams.accuracy,
        tapPenalty: calculationParams.tapPenalty,
    };

    if (calculator instanceof DroidDifficultyCalculator) {
        return new DroidPerformanceCalculator(calculator.attributes).calculate(
            calculationOptions,
        );
    } else if (calculator instanceof OsuDifficultyCalculator) {
        return new OsuPerformanceCalculator(calculator.attributes).calculate(
            calculationOptions,
        );
    } else if (calculator instanceof RebalanceDroidDifficultyCalculator) {
        return new RebalanceDroidPerformanceCalculator(
            calculator.attributes,
        ).calculate(calculationOptions);
    } else {
        return new RebalanceOsuPerformanceCalculator(
            calculator.attributes,
        ).calculate(calculationOptions);
    }
}
