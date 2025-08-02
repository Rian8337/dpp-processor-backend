import { Controller } from "@/decorators/controller";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    ILiveDroidCalculationService,
    ILiveOsuCalculationService,
    IRebalanceDroidCalculationService,
    IRebalanceOsuCalculationService,
    IReplayService,
    IScoreService,
} from "@/services";
import { ICalculationService } from "@/services/ICalculationService";
import {
    CalculationMethod,
    CompleteCalculationAttributes,
    PerformanceAttributes,
    RawDifficultyAttributes,
} from "@/types";
import { Modes } from "@rian8337/osu-base";
import { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

type GetOnlineScoreAttributesResponse =
    | {
          attributes: CompleteCalculationAttributes<
              RawDifficultyAttributes,
              PerformanceAttributes
          >;
          strainChart: number[] | null;
      }
    | { error: string };

/**
 * Controller for online score attributes.
 */
@Controller("/get-online-score-attributes")
export class OnlineScoreAttributesController extends BaseController {
    constructor(
        @inject(dependencyTokens.scoreService)
        private readonly scoreService: IScoreService,

        @inject(dependencyTokens.replayService)
        private readonly replayService: IReplayService,

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
     * Obtains the performance attributes of a score.
     *
     * @param req The request object containing the parameters.
     * @param res The response object to send the result.
     */
    async getOnlineScoreAttributes(
        req: Request<
            "/",
            GetOnlineScoreAttributesResponse,
            unknown,
            {
                key: string;
                uid: number;
                beatmaphash: string;
                gamemode: Modes;
                calculationmethod: CalculationMethod;
                generatestrainchart?: string;
                usebestpp?: string;
            }
        >,
        res: Response<GetOnlineScoreAttributesResponse>,
    ) {
        const { uid, beatmaphash, gamemode, calculationmethod } = req.query;
        const useBestPP = !!req.query.usebestpp;
        const generateStrainChart = !!req.query.generatestrainchart;

        const score = useBestPP
            ? await this.scoreService.getBestScore(uid, beatmaphash, false)
            : await this.scoreService.getScore(uid, beatmaphash, false);

        if (!score) {
            res.status(404).json({ error: "Score not found" });
            return;
        }

        let result: Awaited<
            ReturnType<
                ICalculationService<
                    RawDifficultyAttributes,
                    PerformanceAttributes
                >["calculateScore"]
            >
        >;

        try {
            switch (gamemode) {
                case Modes.droid:
                    switch (calculationmethod) {
                        case CalculationMethod.live:
                            result =
                                await this.liveDroidCalculationService.calculateScore(
                                    score,
                                    useBestPP,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceDroidCalculationService.calculateScore(
                                    score,
                                    useBestPP,
                                    generateStrainChart,
                                );
                            break;
                    }
                    break;

                case Modes.osu:
                    switch (calculationmethod) {
                        case CalculationMethod.live:
                            result =
                                await this.liveOsuCalculationService.calculateScore(
                                    score,
                                    useBestPP,
                                    generateStrainChart,
                                );
                            break;

                        case CalculationMethod.rebalance:
                            result =
                                await this.rebalanceOsuCalculationService.calculateScore(
                                    score,
                                    useBestPP,
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
