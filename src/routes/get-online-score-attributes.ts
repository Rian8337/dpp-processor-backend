import {
    Accuracy,
    MathUtils,
    Modes,
    ModUtil,
    ScoreRank,
} from "@rian8337/osu-base";
import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import { Router } from "express";
import {
    getOfficialBestScore,
    getOfficialScore,
} from "../database/official/officialDatabaseUtil";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { getOfficialBestReplay, getOnlineReplay } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";
import { OfficialDatabaseScore } from "../database/official/schema/OfficialDatabaseScore";
import { isDeepStrictEqual } from "util";

function isReplayValid(
    databaseScore: Score | OfficialDatabaseScore,
    replayData: ReplayData,
): boolean {
    // Wrap the score in a Score object.
    const score =
        databaseScore instanceof Score
            ? databaseScore
            : new Score({
                  ...databaseScore,
                  username: "",
                  mark: databaseScore.mark as ScoreRank,
                  date: databaseScore.date.getTime(),
                  slider_tick_hit: databaseScore.sliderTickHit,
                  slider_end_hit: databaseScore.sliderEndHit,
              });

    // For replay v1 and v2, there is not that much information - just check the accuracy and hash.
    if (
        score.hash !== replayData.hash ||
        !score.accuracy.equals(replayData.accuracy) ||
        // Also check if the accuracy is "empty", as in there are no hits at all.
        Number.isNaN(replayData.accuracy.value())
    ) {
        return false;
    }

    // Replay v3 has way more information - compare all relevant ones.
    if (replayData.isReplayV3()) {
        if (
            score.score !== replayData.score ||
            score.combo !== replayData.maxCombo ||
            (!(databaseScore instanceof Score) &&
                (databaseScore.geki !== replayData.hit300k ||
                    databaseScore.katu !== replayData.hit100k)) ||
            score.rank !== replayData.rank
        ) {
            return false;
        }

        // Mods are compared later as they are more costly.
        const scoreMods = score.mods.serializeMods();
        const replayMods = replayData.convertedMods.serializeMods();

        if (!isDeepStrictEqual(scoreMods, replayMods)) {
            return false;
        }
    }

    // Replay v4? Well... nothing new to check there, so let's end it here.
    return true;
}

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    Partial<{
        key: string;
        uid: string;
        hash: string;
        gamemode: string;
        calculationmethod: string;
        generatestrainchart?: string;
        usebestpp?: string;
    }>
>("/", validateGETInternalKey, async (req, res) => {
    const { gamemode, uid, hash, usebestpp } = req.query;

    if (!uid) {
        return res.status(400).json({ error: "Player ID is not specified" });
    }

    if (!hash) {
        return res.status(400).json({ error: "Beatmap hash is not specified" });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (!req.query.calculationmethod) {
        return res
            .status(400)
            .json({ error: "Calculation method is not specified" });
    }

    const calculationMethod = parseInt(req.query.calculationmethod);

    if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.live &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const generateStrainChart = req.query.generatestrainchart !== undefined;
    const score = usebestpp
        ? await getOfficialBestScore(parseInt(uid), hash, false)
        : await getOfficialScore(parseInt(uid), hash, false);

    if (!score) {
        return res.status(404).json({ error: "Score not found" });
    }

    const analyzer = new ReplayAnalyzer({ scoreID: score.id });

    // Retrieve replay locally.
    analyzer.originalODR = usebestpp
        ? await getOfficialBestReplay(score.id)
        : await getOnlineReplay(score.id);

    await analyzer.analyze().catch(() => {
        console.error(`Score of ID ${score.id.toString()} cannot be parsed`);
    });

    const { data } = analyzer;

    let overrideParameters: PerformanceCalculationParameters | undefined;

    if (
        data !== null &&
        (data.replayVersion < 3 || !isReplayValid(score, data))
    ) {
        // Old replay version or invalid replay - fill in missing data.
        if (score instanceof Score) {
            overrideParameters = new PerformanceCalculationParameters({
                accuracy: score.accuracy,
                combo: score.combo,
                mods: score.mods,
            });
        } else {
            overrideParameters = new PerformanceCalculationParameters({
                accuracy: new Accuracy({
                    n300: score.perfect,
                    n100: score.good,
                    n50: score.bad,
                    nmiss: score.miss,
                }),
                combo: score.combo,
                mods: ModUtil.deserializeMods(score.mods),
            });
        }
    }

    let attributes: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >;
    let strainChart: Buffer | null = null;

    const requestedMods = data?.isReplayV3()
        ? data.convertedMods.serializeMods()
        : (overrideParameters?.mods.serializeMods() ??
          (score instanceof Score ? score.mods.serializeMods() : score.mods));

    switch (gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult = await (
                        data != null
                            ? difficultyCalculator.calculateReplayPerformance(
                                  analyzer,
                                  generateStrainChart,
                                  overrideParameters,
                              )
                            : difficultyCalculator.calculateScorePerformance(
                                  score,
                                  generateStrainChart,
                              )
                    ).catch((e: unknown) => {
                        console.log(
                            "Calculation failed for URL:",
                            req.url.replace(
                                process.env.DROID_SERVER_INTERNAL_KEY!,
                                "",
                            ),
                        );
                        console.error(e);

                        return e instanceof Error
                            ? e.message
                            : "Calculation failed";
                    });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: requestedMods,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            tap: result.tap,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                            visual: result.visual,
                            deviation: result.deviation,
                            tapDeviation: result.tapDeviation,
                            tapPenalty: result.tapPenalty,
                            aimSliderCheesePenalty:
                                result.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                result.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                result.visualSliderCheesePenalty,
                        } as DroidPerformanceAttributes,
                        replay: calculationResult.replay,
                    };

                    strainChart = calculationResult.strainChart;

                    break;
                }

                case PPCalculationMethod.rebalance: {
                    const calculationResult = await (
                        data !== null
                            ? difficultyCalculator.calculateReplayRebalancePerformance(
                                  analyzer,
                                  generateStrainChart,
                                  overrideParameters,
                              )
                            : difficultyCalculator.calculateScoreRebalancePerformance(
                                  score,
                                  generateStrainChart,
                              )
                    ).catch((e: unknown) => {
                        console.log(
                            "Calculation failed for URL:",
                            req.url.replace(
                                process.env.DROID_SERVER_INTERNAL_KEY!,
                                "",
                            ),
                        );
                        console.error(e);

                        return e instanceof Error
                            ? e.message
                            : "Calculation failed";
                    });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: requestedMods,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            tap: result.tap,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                            visual: result.visual,
                            deviation: result.deviation,
                            tapDeviation: result.tapDeviation,
                            tapPenalty: result.tapPenalty,
                            aimSliderCheesePenalty:
                                result.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                result.flashlightSliderCheesePenalty,
                            visualSliderCheesePenalty:
                                result.visualSliderCheesePenalty,
                            calculatedUnstableRate:
                                result.calculatedUnstableRate,
                            estimatedUnstableRate: MathUtils.round(
                                result.deviation * 10,
                                2,
                            ),
                            estimatedSpeedUnstableRate: MathUtils.round(
                                result.tapDeviation * 10,
                                2,
                            ),
                        } as RebalanceDroidPerformanceAttributes,
                        replay: calculationResult.replay,
                    };

                    strainChart = calculationResult.strainChart;

                    break;
                }
            }

            break;
        }

        case Modes.osu: {
            const difficultyCalculator = new BeatmapOsuDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult = await (
                        data !== null
                            ? difficultyCalculator.calculateReplayPerformance(
                                  analyzer,
                                  generateStrainChart,
                                  overrideParameters,
                              )
                            : difficultyCalculator.calculateScorePerformance(
                                  score,
                                  generateStrainChart,
                              )
                    ).catch((e: unknown) => {
                        console.log(
                            "Calculation failed for URL:",
                            req.url.replace(
                                process.env.DROID_SERVER_INTERNAL_KEY!,
                                "",
                            ),
                        );
                        console.error(e);

                        return e instanceof Error
                            ? e.message
                            : "Calculation failed";
                    });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: requestedMods,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        } as OsuPerformanceAttributes,
                    };

                    strainChart = calculationResult.strainChart;

                    break;
                }

                case PPCalculationMethod.rebalance: {
                    const calculationResult = await (
                        data !== null
                            ? difficultyCalculator.calculateReplayRebalancePerformance(
                                  analyzer,
                                  generateStrainChart,
                                  overrideParameters,
                              )
                            : difficultyCalculator.calculateScoreRebalancePerformance(
                                  score,
                                  generateStrainChart,
                              )
                    ).catch((e: unknown) => {
                        console.log(
                            "Calculation failed for URL:",
                            req.url.replace(
                                process.env.DROID_SERVER_INTERNAL_KEY!,
                                "",
                            ),
                        );
                        console.error(e);

                        return e instanceof Error
                            ? e.message
                            : "Calculation failed";
                    });

                    if (typeof calculationResult === "string") {
                        return res
                            .status(503)
                            .json({ error: calculationResult });
                    }

                    const { result } = calculationResult;

                    attributes = {
                        params: calculationResult.params.toCloneable(),
                        difficulty: {
                            ...calculationResult.difficultyAttributes,
                            mods: requestedMods,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        } as OsuPerformanceAttributes,
                    };

                    strainChart = calculationResult.strainChart;

                    break;
                }
            }

            break;
        }
    }

    res.json({
        attributes: attributes,
        strainChart: strainChart?.toJSON().data ?? null,
    });
});

export default router;
