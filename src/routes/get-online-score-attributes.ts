import { Router } from "express";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Accuracy, MathUtils, Modes } from "@rian8337/osu-base";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { getOfficialBestReplay, getOnlineReplay } from "../utils/replayManager";
import { validateGETInternalKey } from "../utils/util";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";
import {
    getOfficialBestScore,
    getOfficialScore,
    parseOfficialScoreMods,
} from "../database/official/officialDatabaseUtil";
import { Score } from "@rian8337/osu-droid-utilities";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";

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
        ? await getOfficialBestScore(parseInt(uid), hash)
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
    if (!data) {
        return res.status(404).json({ error: "Replay not found" });
    }

    let overrideParameters: PerformanceCalculationParameters | undefined;

    if (data.replayVersion < 3) {
        // Old replay version - fill in missing data.
        if (score instanceof Score) {
            overrideParameters = new PerformanceCalculationParameters({
                accuracy: score.accuracy,
                combo: score.combo,
                mods: score.mods,
                customSpeedMultiplier: score.speedMultiplier,
                forceAR: score.forceAR,
                forceCS: score.forceCS,
                forceHP: score.forceHP,
                forceOD: score.forceOD,
                oldStatistics: score.oldStatistics,
            });
        } else {
            const parsedMods = parseOfficialScoreMods(score.mode);

            overrideParameters = new PerformanceCalculationParameters({
                accuracy: new Accuracy({
                    n300: score.perfect,
                    n100: score.good,
                    n50: score.bad,
                    nmiss: score.miss,
                }),
                combo: score.combo,
                mods: parsedMods.mods,
                customSpeedMultiplier: parsedMods.speedMultiplier,
                forceAR: parsedMods.forceAR,
                forceCS: parsedMods.forceCS,
                forceHP: parsedMods.forceHP,
                forceOD: parsedMods.forceOD,
                oldStatistics: parsedMods.oldStatistics,
            });
        }
    }

    let attributes: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >;
    let strainChart: Buffer | null = null;

    switch (gamemode) {
        case Modes.droid: {
            const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

            switch (calculationMethod) {
                case PPCalculationMethod.live: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            analyzer,
                            generateStrainChart,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
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
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
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
                        },
                        replay: calculationResult.replay,
                    } as CompleteCalculationAttributes<
                        DroidDifficultyAttributes,
                        DroidPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayRebalancePerformance(
                            analyzer,
                            generateStrainChart,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
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
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
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
                        },
                        replay: calculationResult.replay,
                    } as CompleteCalculationAttributes<
                        RebalanceDroidDifficultyAttributes,
                        RebalanceDroidPerformanceAttributes
                    >;

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
                    const calculationResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            analyzer,
                            generateStrainChart,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
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
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    } as CompleteCalculationAttributes<
                        OsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

                    strainChart = calculationResult.strainChart;

                    break;
                }
                case PPCalculationMethod.rebalance: {
                    const calculationResult = await difficultyCalculator
                        .calculateReplayRebalancePerformance(
                            analyzer,
                            generateStrainChart,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
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
                            mods: calculationResult.difficultyAttributes.mods.reduce(
                                (a, v) => a + v.acronym,
                                "",
                            ),
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            speed: result.speed,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                        },
                    } as CompleteCalculationAttributes<
                        RebalanceOsuDifficultyAttributes,
                        OsuPerformanceAttributes
                    >;

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
