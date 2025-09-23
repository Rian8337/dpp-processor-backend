import {
    Accuracy,
    MathUtils,
    Modes,
    ModUtil,
    SerializedMod,
} from "@rian8337/osu-base";
import { Router } from "express";
import { CompleteCalculationAttributes } from "../structures/attributes/CompleteCalculationAttributes";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { PerformanceAttributes } from "../structures/attributes/PerformanceAttributes";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { RebalanceDroidPerformanceAttributes } from "../structures/attributes/RebalanceDroidPerformanceAttributes";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import {
    getBeatmap,
    updateBeatmapMaxCombo,
} from "../utils/cache/beatmapStorage";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { validatePOSTInternalKey } from "../utils/util";

const router = Router();

router.post<
    "/",
    unknown,
    unknown,
    Partial<{
        key: string;
        beatmapid: string;
        beatmaphash: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
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
>("/", validatePOSTInternalKey, async (req, res) => {
    if (!req.body.beatmapid && !req.body.beatmaphash) {
        return res
            .status(400)
            .json({ error: "Neither beatmap ID or hash is specified" });
    }

    if (!req.body.calculationmethod) {
        return res
            .status(400)
            .json({ error: "Calculation method is not specified" });
    }

    const generateStrainChart = req.body.generatestrainchart !== undefined;

    let requestMods: SerializedMod[];

    try {
        requestMods = JSON.parse(req.body.mods ?? "[]") as SerializedMod[];
    } catch (e) {
        return res.status(400).json({ error: "Invalid mods format" });
    }

    if (!Array.isArray(requestMods)) {
        return res.status(400).json({ error: "Invalid mods format" });
    }

    // Check if mods are valid
    for (const mod of requestMods) {
        if (typeof mod !== "object" || !mod.acronym) {
            return res.status(400).json({ error: "Invalid mods format" });
        }
    }

    const mods = ModUtil.deserializeMods(requestMods);

    const { beatmapid, beatmaphash, gamemode } = req.body;
    const calculationMethod = parseInt(req.body.calculationmethod);

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
        accuracy: new Accuracy({
            n300: Math.max(0, parseInt(req.body.n300 ?? "-1")),
            n100: Math.max(0, parseInt(req.body.n100 ?? "0")),
            n50: Math.max(0, parseInt(req.body.n50 ?? "0")),
            nmiss: Math.max(0, parseInt(req.body.nmiss ?? "0")),
            nobjects: apiBeatmap.objectCount,
        }),
        combo:
            typeof req.body.maxcombo === "string" &&
            apiBeatmap.maxCombo !== null
                ? MathUtils.clamp(
                      parseInt(req.body.maxcombo),
                      0,
                      apiBeatmap.maxCombo,
                  )
                : (apiBeatmap.maxCombo ?? undefined),
        tapPenalty: parseInt(req.body.tappenalty ?? "1"),
        sliderCheesePenalty: {
            aimPenalty: parseInt(req.body.aimslidercheesepenalty ?? "1"),
            flashlightPenalty: parseInt(
                req.body.flashlightslidercheesepenalty ?? "1",
            ),
            visualPenalty: parseInt(req.body.visualslidercheesepenalty ?? "1"),
        },
    });

    let attributes: CompleteCalculationAttributes<
        RawDifficultyAttributes,
        PerformanceAttributes
    >;
    let strainChart: Buffer | null = null;

    const requestedMods = mods.serializeMods();

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
                            mods: requestedMods,
                        },
                        performance: {
                            total: result.total,
                            aim: result.aim,
                            tap: result.tap,
                            accuracy: result.accuracy,
                            flashlight: result.flashlight,
                            reading: result.reading,
                            deviation: result.deviation,
                            tapDeviation: result.tapDeviation,
                            tapPenalty: result.tapPenalty,
                            aimSliderCheesePenalty:
                                result.aimSliderCheesePenalty,
                            flashlightSliderCheesePenalty:
                                result.flashlightSliderCheesePenalty,
                            estimatedUnstableRate: result.deviation * 10,
                            estimatedSpeedUnstableRate:
                                result.tapDeviation * 10,
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

    if (apiBeatmap.maxCombo === null) {
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
