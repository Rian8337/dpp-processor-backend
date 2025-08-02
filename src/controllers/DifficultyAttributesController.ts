import { CalculationParameters } from "@/calculations";
import { Authenticated } from "@/decorators/auth";
import { Controller } from "@/decorators/controller";
import { Post } from "@/decorators/routes";
import {
    BeatmapHashValidator,
    BeatmapIdValidator,
    CalculationMethodValidator,
    GamemodeValidator,
    ModsValidator,
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
    PerformanceAttributes,
    RawDifficultyAttributes,
} from "@/types";
import { Modes, ModUtil, SerializedMod } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

type GetDifficultyAttributesResponse =
    | {
          attributes: CacheableDifficultyAttributes<RawDifficultyAttributes>;
          strainChart: number[] | null;
      }
    | { error: string };

/**
 * Controller for calculating difficulty attributes.
 */
@Controller("/difficulty-attributes")
export class DifficultyAttributesController extends BaseController {
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
     * Obtains the difficulty attributes of a beatmap.
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
    async getDifficultyAttributes(
        req: Request<
            "/",
            GetDifficultyAttributesResponse,
            {
                key: string;
                beatmapid?: number;
                beatmaphash?: string;
                gamemode: Modes;
                calculationmethod: CalculationMethod;
                mods?: SerializedMod[];
                generatestrainchart?: string;
            }
        >,
        res: Response<GetDifficultyAttributesResponse>,
    ) {
        const { beatmapid, beatmaphash, gamemode, calculationmethod } =
            req.body;

        if (!beatmapid && !beatmaphash) {
            res.status(400).json({
                error: "Either beatmap ID or hash must be provided.",
            });

            return;
        }

        const idOrHash = beatmapid ?? beatmaphash!;
        const generateStrainChart = !!req.body.generatestrainchart;

        const parameters = new CalculationParameters({
            mods: ModUtil.deserializeMods(req.body.mods ?? []),
        });

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
            console.error("Error calculating difficulty attributes:", e);

            res.status(500).json({
                error: "An error occurred while calculating difficulty attributes.",
            });

            return;
        }

        if (result.failed()) {
            this.respondWithOperationResult(res, result);
            return;
        }

        res.json({
            attributes: result.data.difficultyAttributes,
            strainChart: result.data.strainChart?.toJSON().data ?? null,
        });
    }
}
