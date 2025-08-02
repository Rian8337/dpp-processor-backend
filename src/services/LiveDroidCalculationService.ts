import { IBeatmapAPIProvider } from "@/api";
import { Service } from "@/decorators/service";
import { dependencyTokens } from "@/dependencies/tokens";
import { ILiveDroidDifficultyAttributesRepository } from "@/repositories/processor";
import { DroidPerformanceAttributes } from "@/types";
import {
    CacheableDifficultyAttributes,
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    IExtendedDroidDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import { DroidCalculationService } from "./DroidCalculationService";
import { IBeatmapService } from "./IBeatmapService";
import { ILiveDroidCalculationService } from "./ILiveDroidCalculationService";
import { IReplayService } from "./IReplayService";

/**
 * Provides calculation operations for live osu!droid difficulty and performance.
 */
@Service(dependencyTokens.liveDroidCalculationService)
export class LiveDroidCalculationService
    extends DroidCalculationService<
        IExtendedDroidDifficultyAttributes,
        DroidPerformanceAttributes
    >
    implements ILiveDroidCalculationService
{
    protected override readonly difficultyCalculator =
        new DroidDifficultyCalculator();

    constructor(
        @inject(dependencyTokens.liveDroidDifficultyAttributesRepository)
        attributesRepository: ILiveDroidDifficultyAttributesRepository,

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
        const performance = new DroidPerformanceCalculator(
            attributes,
        ).calculate(options);

        return {
            total: performance.total,
            aim: performance.aim,
            tap: performance.tap,
            accuracy: performance.accuracy,
            flashlight: performance.flashlight,
            visual: performance.visual,
            deviation: performance.deviation,
            tapDeviation: performance.tapDeviation,
            tapPenalty: performance.tapPenalty,
            aimSliderCheesePenalty: performance.aimSliderCheesePenalty,
            flashlightSliderCheesePenalty:
                performance.flashlightSliderCheesePenalty,
            visualSliderCheesePenalty: performance.visualSliderCheesePenalty,
        };
    }
}
