import { OsuPerformanceAttributes } from "@/types";
import { Modes } from "@rian8337/osu-base";
import { IOsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { IOsuDifficultyAttributes as IRebalanceOsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import { CalculationService } from "./CalculationService";

/**
 * Provides calculation operations for osu! difficulty and performance.
 */
export abstract class OsuCalculationService<
    TDifficultyAttributes extends
        | IOsuDifficultyAttributes
        | IRebalanceOsuDifficultyAttributes,
> extends CalculationService<TDifficultyAttributes, OsuPerformanceAttributes> {
    protected override readonly mode = Modes.osu;
}
