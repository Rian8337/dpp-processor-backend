import { CalculationParameters } from "@/calculations";
import { Authenticated } from "@/decorators/auth";
import { Controller } from "@/decorators/controller";
import { Post } from "@/decorators/routes";
import {
    AccuracyValidator,
    BeatmapHashValidator,
    BeatmapIdValidator,
    CalculationMethodValidator,
    GamemodeValidator,
    MaximumComboValidator,
    ModsValidator,
    PenaltyValidator,
    SliderNestedHitObjectInformationValidator,
} from "@/decorators/validators";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    IBeatmapService,
    ILiveDroidCalculationService,
    ILiveOsuCalculationService,
    IRebalanceDroidCalculationService,
    IRebalanceOsuCalculationService,
} from "@/services";
import { ICalculationService } from "@/services/ICalculationService";
import {
    CalculationMethod,
    CompleteCalculationAttributes,
    PerformanceAttributes,
    RawDifficultyAttributes,
} from "@/types";
import { Accuracy, Modes, ModUtil, SerializedMod } from "@rian8337/osu-base";
import { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

type GetPerformanceAttributesResponse =
    | {
          attributes: CompleteCalculationAttributes<
              RawDifficultyAttributes,
              PerformanceAttributes
          >;
          strainChart: number[] | null;
      }
    | { error: string };

/**
 * Controller for calculating difficulty attributes.
 */
@Controller("/performance-attributes")
export class PerformanceAttributesController extends BaseController {
    constructor(
        @inject(dependencyTokens.beatmapService)
        private readonly beatmapService: IBeatmapService,

        @inject(dependencyTokens.liveDroidCalculationService)
        private readonly liveDroidCalculationService: ILiveDroidCalculationService,

        @inject(dependencyTokens.rebalanceDroidCalculationService)
        private readonly rebalanceDroidCalculationService: IRebalanceDroidCalculationService,

        @inject(dependencyTokens.liveOsuCalculationService)
        private readonly liveOsuCalculationService: ILiveOsuCalculationService,

        @inject(dependencyTokens.rebalanceOsuCalculationService)
        private readonly rebalanceOsuCalculationService: IRebalanceOsuCalculationService,
    ) {
        super();
    }

    /**
     * Obtains the performance attributes of a beatmap.
     *
     * @param req The request object containing the parameters.
     * @param res The response object to send the result.
     */
    @Post()
    @Authenticated()
    @BeatmapIdValidator(false)
    @BeatmapHashValidator(false)
    @GamemodeValidator()
    @CalculationMethodValidator()
    @ModsValidator(false)
    @AccuracyValidator(false)
    @MaximumComboValidator(false)
    @SliderNestedHitObjectInformationValidator(false)
    @PenaltyValidator(false)
    async getPerformanceAttributes(
        req: Request<
            "/",
            GetPerformanceAttributesResponse,
            {
                key: string;
                beatmapid?: number;
                beatmaphash?: string;
                gamemode: Modes;
                calculationmethod: CalculationMethod;
                mods?: SerializedMod[];
                n300?: number;
                n100?: number;
                n50?: number;
                nmiss?: number;
                maxcombo?: number;
                sliderticksmissed?: number;
                sliderendsdropped?: number;
                aimslidercheesepenalty?: number;
                tappenalty?: number;
                flashlightslidercheesepenalty?: number;
                visualslidercheesepenalty?: number;
                generatestrainchart?: string;
            }
        >,
        res: Response<GetPerformanceAttributesResponse>,
    ) {
        const { beatmapid, beatmaphash, gamemode, calculationmethod } =
            req.body;

        if (!beatmapid && !beatmaphash) {
            res.status(400).json({ error: "Beatmap ID or hash is required." });
            return;
        }

        const idOrHash = beatmapid ?? beatmaphash!;

        const parameters = new CalculationParameters({
            mods: ModUtil.deserializeMods(req.body.mods ?? []),
            accuracy: new Accuracy({
                n300: req.body.n300,
                n100: req.body.n100,
                n50: req.body.n50,
                nmiss: req.body.nmiss,
            }),
            combo: req.body.maxcombo,
            tapPenalty: req.body.tappenalty,
            sliderCheesePenalty: {
                aimPenalty: req.body.aimslidercheesepenalty ?? 1,
                flashlightPenalty: req.body.flashlightslidercheesepenalty ?? 1,
                visualPenalty: req.body.visualslidercheesepenalty ?? 1,
            },
            sliderTicksMissed: req.body.sliderticksmissed,
            sliderEndsDropped: req.body.sliderendsdropped,
        });

        const generateStrainChart = !!req.body.generatestrainchart;

        let result: Awaited<
            ReturnType<
                ICalculationService<
                    RawDifficultyAttributes,
                    PerformanceAttributes
                >["calculateBeatmap"]
            >
        >;

        try {
            switch (gamemode) {
                case Modes.droid:
                    switch (calculationmethod) {
                        case CalculationMethod.live:
                            result =
                                await this.liveDroidCalculationService.calculateBeatmap(
                                    idOrHash,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceDroidCalculationService.calculateBeatmap(
                                    idOrHash,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;
                    }
                    break;

                case Modes.osu:
                    switch (calculationmethod) {
                        case CalculationMethod.live:
                            result =
                                await this.liveOsuCalculationService.calculateBeatmap(
                                    idOrHash,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceOsuCalculationService.calculateBeatmap(
                                    idOrHash,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;
                    }
                    break;
            }
        } catch (e) {
            console.error("Error calculating performance attributes:", e);

            res.status(500).json({
                error: "An error occurred while calculating performance attributes.",
            });

            return;
        }

        if (result.failed()) {
            this.respondWithOperationResult(res, result);
            return;
        }

        const { data } = result;

        res.json({
            attributes: {
                params: data.parameters.toCloneable(),
                difficulty: data.difficultyAttributes,
                performance: data.performanceAttributes,
            },
            strainChart: data.strainChart?.toJSON().data ?? null,
        });
    }
}
