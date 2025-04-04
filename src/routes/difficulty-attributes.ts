import { Accuracy, ModUtil, Modes, SerializedMod } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { Router } from "express";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import {
    getBeatmap,
    updateBeatmapMaxCombo,
} from "../utils/cache/beatmapStorage";
import { DifficultyAttributesCacheManager } from "../utils/cache/difficultyattributes/DifficultyAttributesCacheManager";
import {
    liveDroidDifficultyCache,
    liveOsuDifficultyCache,
    rebalanceDroidDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../utils/cache/difficultyAttributesStorage";
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
        generatestrainchart?: string;
    }>
>("/", validatePOSTInternalKey, async (req, res) => {
    console.log(req.body.mods);

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

    const beatmap = await getBeatmap(
        beatmapid !== undefined ? parseInt(beatmapid) : beatmaphash!,
    );

    if (!beatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    const generateStrainChart = req.body.generatestrainchart !== undefined;

    let difficultyAttributes: CacheableDifficultyAttributes<RawDifficultyAttributes> | null;
    let strainChart: Buffer | null = null;
    let difficultyCacheManager: DifficultyAttributesCacheManager<RawDifficultyAttributes>;
    let difficultyCalculator:
        | BeatmapDroidDifficultyCalculator
        | BeatmapOsuDifficultyCalculator;

    const calculationParams = new PerformanceCalculationParameters({
        mods: mods,
        combo: beatmap.maxCombo ?? undefined,
        accuracy: new Accuracy({ nobjects: beatmap.objectCount }),
    });

    switch (calculationMethod) {
        case PPCalculationMethod.live: {
            switch (gamemode) {
                case Modes.droid:
                    difficultyCalculator =
                        new BeatmapDroidDifficultyCalculator();
                    difficultyCacheManager = liveDroidDifficultyCache;
                    break;

                case Modes.osu:
                    difficultyCalculator = new BeatmapOsuDifficultyCalculator();
                    difficultyCacheManager = liveOsuDifficultyCache;
                    break;
            }
            break;
        }

        case PPCalculationMethod.rebalance: {
            switch (gamemode) {
                case Modes.droid:
                    difficultyCalculator =
                        new BeatmapDroidDifficultyCalculator();
                    difficultyCacheManager = rebalanceDroidDifficultyCache;
                    break;

                case Modes.osu:
                    difficultyCalculator = new BeatmapOsuDifficultyCalculator();
                    difficultyCacheManager = rebalanceOsuDifficultyCache;
                    break;
            }
            break;
        }
    }

    difficultyAttributes = await difficultyCacheManager.getDifficultyAttributes(
        beatmap.id,
        mods,
    );

    if (!difficultyAttributes || generateStrainChart) {
        const calculationResult = await (
            calculationMethod === PPCalculationMethod.live
                ? difficultyCalculator.calculateBeatmapPerformance(
                      beatmap,
                      calculationParams,
                      generateStrainChart,
                  )
                : difficultyCalculator.calculateBeatmapRebalancePerformance(
                      beatmap,
                      calculationParams,
                      generateStrainChart,
                  )
        ).catch((e: unknown) => {
            console.log(
                "Calculation failed for URL:",
                req.url.replace(process.env.DROID_SERVER_INTERNAL_KEY!, ""),
            );
            console.error(e);

            return e instanceof Error ? e.message : "Calculation failed";
        });

        if (typeof calculationResult === "string") {
            return res.status(503).json({ error: calculationResult });
        }

        difficultyAttributes = {
            ...calculationResult.difficultyAttributes,
            // Override mods so that the response retains the originally requested mods.
            mods: ModUtil.serializeMods(mods),
        };
        strainChart = calculationResult.strainChart;
    }

    if (beatmap.maxCombo === null) {
        // Update beatmap max combo based on calculation result.
        await updateBeatmapMaxCombo(beatmap.id, difficultyAttributes.maxCombo);
    }

    res.json({
        attributes: difficultyAttributes,
        strainChart: strainChart?.toJSON().data ?? null,
    });
});

export default router;
