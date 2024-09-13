import { Accuracy, MathUtils, ModUtil, Modes } from "@rian8337/osu-base";
import { Router } from "express";
import {
    getBeatmap,
    updateBeatmapMaxCombo,
} from "../utils/cache/beatmapStorage";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { DifficultyAttributesCacheManager } from "../utils/cache/difficultyattributes/DifficultyAttributesCacheManager";
import {
    liveDroidDifficultyCache,
    liveOsuDifficultyCache,
    rebalanceDroidDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../utils/cache/difficultyAttributesStorage";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { ProcessorDatabaseDifficultyAttributes } from "../database/processor/schema/ProcessorDatabaseDifficultyAttributes";
import { validateGETInternalKey } from "../utils/util";

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

    const beatmap = await getBeatmap(
        beatmapid !== undefined ? parseInt(beatmapid) : beatmaphash!,
    );

    if (!beatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    const generateStrainChart = req.query.generatestrainchart !== undefined;

    let difficultyAttributes: CacheableDifficultyAttributes<RawDifficultyAttributes> | null;
    let strainChart: Buffer | null = null;
    let difficultyCacheManager: DifficultyAttributesCacheManager<
        RawDifficultyAttributes,
        ProcessorDatabaseDifficultyAttributes
    >;
    let difficultyCalculator:
        | BeatmapDroidDifficultyCalculator
        | BeatmapOsuDifficultyCalculator;

    const calculationParams = new PerformanceCalculationParameters({
        mods: mods,
        customSpeedMultiplier: customSpeedMultiplier,
        combo: beatmap.max_combo ?? undefined,
        accuracy: new Accuracy({ nobjects: beatmap.object_count }),
        forceCS: forceCS,
        forceAR: forceAR,
        forceOD: forceOD,
        oldStatistics: oldStatistics,
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
        difficultyCacheManager.getAttributeName(
            mods,
            oldStatistics,
            customSpeedMultiplier,
            forceCS,
            forceAR,
            forceOD,
        ),
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
            mods: ModUtil.modsToOsuString(
                calculationResult.difficultyAttributes.mods,
            ),
        };
        strainChart = calculationResult.strainChart;
    }

    if (beatmap.max_combo === null) {
        // Update beatmap max combo based on calculation result.
        await updateBeatmapMaxCombo(beatmap.id, difficultyAttributes.maxCombo);
    }

    res.json({
        attributes: difficultyAttributes,
        strainChart: strainChart?.toJSON().data ?? null,
    });
});

export default router;
