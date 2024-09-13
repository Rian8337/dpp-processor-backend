import { ModUtil, MathUtils, Modes, Accuracy } from "@rian8337/osu-base";
import { Router } from "express";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import {
    getBeatmap,
    updateBeatmapMaxCombo,
} from "../utils/cache/beatmapStorage";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    DroidDifficultyAttributes as RebalanceDroidDifficultyAttributes,
    OsuDifficultyAttributes as RebalanceOsuDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { validateGETInternalKey } from "../utils/util";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    Partial<{
        key: string;
        beatmapid?: string;
        beatmaphash?: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcecs?: string;
        forcear?: string;
        forceod?: string;
        n300?: string;
        n100?: string;
        n50?: string;
        nmiss?: string;
        maxcombo?: string;
        aimslidercheesepenalty?: string;
        tappenalty?: string;
        flashlightslidercheesepenalty?: string;
        visualslidercheesepenalty?: string;
        generatestrainchart?: string;
    }>
>("/", validateGETInternalKey, async (req, res) => {
    if (!req.query.beatmapid && !req.query.beatmaphash) {
        return res
            .status(400)
            .json({ error: "Neither beatmap ID or hash is specified" });
    }

    if (!req.query.calculationmethod) {
        return res
            .status(400)
            .json({ error: "Calculation method is not specified" });
    }

    const generateStrainChart = req.query.generatestrainchart !== undefined;
    const mods = ModUtil.pcStringToMods(req.query.mods ?? "");
    const oldStatistics = req.query.oldstatistics !== undefined;

    const customSpeedMultiplier = MathUtils.clamp(
        parseFloat(req.query.customspeedmultiplier ?? "1"),
        0.5,
        2,
    );
    if (Number.isNaN(customSpeedMultiplier)) {
        return res
            .status(400)
            .json({ error: "Invalid custom speed multiplier" });
    }

    const forceCS = req.query.forcecs
        ? MathUtils.clamp(parseFloat(req.query.forcecs), 0, 11)
        : undefined;
    if (forceCS !== undefined && Number.isNaN(forceCS)) {
        return res.status(400).json({ error: "Invalid force CS" });
    }

    const forceAR = req.query.forcear
        ? MathUtils.clamp(parseFloat(req.query.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR" });
    }

    const forceOD = req.query.forceod
        ? MathUtils.clamp(parseFloat(req.query.forceod), 0, 11)
        : undefined;
    if (forceOD !== undefined && Number.isNaN(forceOD)) {
        return res.status(400).json({ error: "Invalid force OD" });
    }

    const { beatmapid, beatmaphash, gamemode } = req.query;
    const calculationMethod = parseInt(req.query.calculationmethod);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.live &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const apiBeatmap = await getBeatmap(
        beatmapid !== undefined ? parseInt(beatmapid) : beatmaphash!,
    );

    if (!apiBeatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    const calculationParams = new PerformanceCalculationParameters({
        mods: mods,
        customSpeedMultiplier: customSpeedMultiplier,
        forceCS: forceCS,
        forceAR: forceAR,
        forceOD: forceOD,
        oldStatistics: oldStatistics,
        accuracy: new Accuracy({
            n300: Math.max(0, parseInt(req.query.n300 ?? "-1")),
            n100: Math.max(0, parseInt(req.query.n100 ?? "0")),
            n50: Math.max(0, parseInt(req.query.n50 ?? "0")),
            nmiss: Math.max(0, parseInt(req.query.nmiss ?? "0")),
            nobjects: apiBeatmap.object_count,
        }),
        combo:
            typeof req.query.maxcombo === "string" &&
            apiBeatmap.max_combo !== null
                ? MathUtils.clamp(
                      parseInt(req.query.maxcombo),
                      0,
                      apiBeatmap.max_combo,
                  )
                : (apiBeatmap.max_combo ?? undefined),
        tapPenalty: parseInt(req.query.tappenalty ?? "1"),
        sliderCheesePenalty: {
            aimPenalty: parseInt(req.query.aimslidercheesepenalty ?? "1"),
            flashlightPenalty: parseInt(
                req.query.flashlightslidercheesepenalty ?? "1",
            ),
            visualPenalty: parseInt(req.query.visualslidercheesepenalty ?? "1"),
        },
    });

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
                        .calculateBeatmapPerformance(
                            apiBeatmap,
                            calculationParams,
                            generateStrainChart,
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
                        params: calculationParams.toCloneable(),
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
                        .calculateBeatmapRebalancePerformance(
                            apiBeatmap,
                            calculationParams,
                            generateStrainChart,
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
                        params: calculationParams.toCloneable(),
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
                            calculatedUnstableRate: 0,
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
                        .calculateBeatmapPerformance(
                            apiBeatmap,
                            calculationParams,
                            generateStrainChart,
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
                        .calculateBeatmapRebalancePerformance(
                            apiBeatmap,
                            calculationParams,
                            generateStrainChart,
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

    if (apiBeatmap.max_combo === null) {
        // Update beatmap max combo based on calculation result.
        await updateBeatmapMaxCombo(
            apiBeatmap.id,
            attributes.difficulty.maxCombo,
        );

        attributes.params.combo ??= attributes.difficulty.maxCombo;

        // Ensure that the combo is within the maximum combo.
        attributes.params.combo = Math.min(
            attributes.params.combo,
            attributes.difficulty.maxCombo,
        );
    }

    res.json({
        attributes: attributes,
        strainChart: strainChart?.toJSON().data ?? null,
    });
});

export default router;
