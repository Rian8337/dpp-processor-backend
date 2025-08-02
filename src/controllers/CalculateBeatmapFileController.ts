import { CalculationParameters } from "@/calculations";
import { Authenticated } from "@/decorators/auth";
import { Controller } from "@/decorators/controller";
import { Post } from "@/decorators/routes";
import {
    AccuracyValidator,
    CalculationMethodValidator,
    GamemodeValidator,
    MaximumComboValidator,
    ModsValidator,
    PenaltyValidator,
    SliderNestedHitObjectInformationValidator,
} from "@/decorators/validators";
import { dependencyTokens } from "@/dependencies/tokens";
import {
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

type CalculateBeatmapFileResponse =
    | {
          attributes: CompleteCalculationAttributes<
              RawDifficultyAttributes,
              PerformanceAttributes
          >;
          strainChart: number[] | null;
      }
    | { error: string };

/**
 * Controller for calculating beatmap files.
 */
@Controller("/calculate-beatmap-file")
export class CalculateBeatmapFileController extends BaseController {
    constructor(
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
     * Calculates the difficulty and performance of a beatmap file.
     *
     * @param req The request object containing the beatmap file and parameters.
     * @param res The response object to send the result.
     */
    @Post()
    @Authenticated()
    @GamemodeValidator()
    @CalculationMethodValidator()
    @ModsValidator(false)
    @AccuracyValidator(false)
    @MaximumComboValidator(false)
    @SliderNestedHitObjectInformationValidator(false)
    @PenaltyValidator(false)
    async calculateBeatmapFile(
        req: Request<
            "/",
            CalculateBeatmapFileResponse,
            {
                key: string;
                beatmapfile?: Buffer;
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
        res: Response<CalculateBeatmapFileResponse>,
    ) {
        const { beatmapfile, gamemode, calculationmethod } = req.body;

        if (!beatmapfile) {
            return res.status(400).json({ error: "Beatmap file is required." });
        }

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
                >["calculateBeatmapFile"]
            >
        >;

        try {
            switch (gamemode) {
                case Modes.droid:
                    switch (calculationmethod) {
                        case CalculationMethod.live:
                            result =
                                await this.liveDroidCalculationService.calculateBeatmapFile(
                                    beatmapfile,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceDroidCalculationService.calculateBeatmapFile(
                                    beatmapfile,
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
                                await this.liveOsuCalculationService.calculateBeatmapFile(
                                    beatmapfile,
                                    parameters,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceOsuCalculationService.calculateBeatmapFile(
                                    beatmapfile,
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
