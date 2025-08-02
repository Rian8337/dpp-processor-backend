import { IBeatmapAPIProvider } from "@/api";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { IRebalanceOsuDifficultyAttributesRepository } from "@/repositories/processor";
import { OsuPerformanceAttributes } from "@/types";
import {
    CacheableDifficultyAttributes,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { inject } from "tsyringe";
import { IBeatmapService } from "./IBeatmapService";
import { IRebalanceOsuCalculationService } from "./IRebalanceOsuCalculationService";
import { OsuCalculationService } from "./OsuCalculationService";
import { IReplayService } from "./IReplayService";

/**
 * Provides calculation operations for rebalance osu! difficulty and performance.
 */
@Repository(dependencyTokens.rebalanceOsuCalculationService)
export class RebalanceOsuCalculationService
    extends OsuCalculationService<IOsuDifficultyAttributes>
    implements IRebalanceOsuCalculationService
{
    protected override readonly difficultyCalculator =
        new OsuDifficultyCalculator();

    constructor(
        @inject(dependencyTokens.rebalanceOsuDifficultyAttributesRepository)
        attributesRepository: IRebalanceOsuDifficultyAttributesRepository,

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
        attributes: CacheableDifficultyAttributes<IOsuDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): OsuPerformanceAttributes {
        const calculator = new OsuPerformanceCalculator(attributes).calculate(
            options,
        );

        return {
            total: calculator.total,
            aim: calculator.aim,
            speed: calculator.speed,
            accuracy: calculator.accuracy,
            flashlight: calculator.flashlight,
        };
    }
}
