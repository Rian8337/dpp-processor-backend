import type { CalculatorAlgorithm } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";

const colors: Record<Modes, Record<CalculatorAlgorithm, string>> = {
    [Modes.Droid]: { live: "#3168e8", rebalance: "#9e1fc4" },
    [Modes.Osu]: { live: "#169c18", rebalance: "#de8723" },
};

/**
 * The strain chart color for a mode and algorithm, matching the old backend.
 */
export function strainChartColor(
    mode: Modes,
    algorithm: CalculatorAlgorithm,
): string {
    return colors[mode][algorithm];
}
