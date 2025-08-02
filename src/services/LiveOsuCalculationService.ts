import { IBeatmapAPIProvider } from "@/api";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import { ILiveOsuDifficultyAttributesRepository } from "@/repositories/processor";
import { OsuPerformanceAttributes } from "@/types";
import {
    CacheableDifficultyAttributes,
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import { IBeatmapService } from "./IBeatmapService";
import { ILiveOsuCalculationService } from "./ILiveOsuCalculationService";
import { OsuCalculationService } from "./OsuCalculationService";
import { IReplayService } from "./IReplayService";

/**
 * Provides calculation operations for live osu!standard difficulty and performance.
 */
@Repository(dependencyTokens.liveOsuCalculationService)
export class LiveOsuCalculationService
    extends OsuCalculationService<IOsuDifficultyAttributes>
    implements ILiveOsuCalculationService
{
    protected override readonly difficultyCalculator =
        new OsuDifficultyCalculator();

    constructor(
        @inject(dependencyTokens.liveOsuDifficultyAttributesRepository)
        attributesRepository: ILiveOsuDifficultyAttributesRepository,

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
