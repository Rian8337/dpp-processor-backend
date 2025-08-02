import { IBeatmapAPIProvider } from "@/api";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { IRebalanceDroidDifficultyAttributesRepository } from "@/repositories/processor";
import { DroidPerformanceAttributes } from "@/types";
import {
    CacheableDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    IExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { inject } from "tsyringe";
import { DroidCalculationService } from "./DroidCalculationService";
import { IBeatmapService } from "./IBeatmapService";
import { IRebalanceDroidCalculationService } from "./IRebalanceDroidCalculationService";
import { IReplayService } from "./IReplayService";

/**
 * Provides calculation operations for rebalance osu!droid difficulty and performance.
 */
@Repository(dependencyTokens.rebalanceDroidCalculationService)
export class RebalanceDroidCalculationService
    extends DroidCalculationService<
        IExtendedDroidDifficultyAttributes,
        DroidPerformanceAttributes
    >
    implements IRebalanceDroidCalculationService
{
    protected override readonly difficultyCalculator =
        new DroidDifficultyCalculator();

    constructor(
        @inject(dependencyTokens.rebalanceDroidDifficultyAttributesRepository)
        attributesRepository: IRebalanceDroidDifficultyAttributesRepository,

        @inject(dependencyTokens.beatmapService)
        beatmapService: IBeatmapService,

        @inject(dependencyTokens.replayService)
        replayService: IReplayService,

        @inject(dependencyTokens.beatmapApiProvider)
        beatmapApiProvider: IBeatmapAPIProvider,
    ) {
        super(
            attributesRepository,
            beatmapService,
            replayService,
            beatmapApiProvider,
        );
    }

    protected override calculatePerformance(
        attributes: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): DroidPerformanceAttributes {
        const calculator = new DroidPerformanceCalculator(attributes).calculate(
            options,
        );

        return {
            total: calculator.total,
            aim: calculator.aim,
            tap: calculator.tap,
            accuracy: calculator.accuracy,
            flashlight: calculator.flashlight,
            visual: calculator.visual,
            deviation: calculator.deviation,
            tapDeviation: calculator.tapDeviation,
            tapPenalty: calculator.tapPenalty,
            aimSliderCheesePenalty: calculator.aimSliderCheesePenalty,
            flashlightSliderCheesePenalty:
                calculator.flashlightSliderCheesePenalty,
            visualSliderCheesePenalty: calculator.visualSliderCheesePenalty,
        };
    }
}
