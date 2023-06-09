import {
    Accuracy,
    MapStats,
    MathUtils,
    ModUtil,
    Modes,
} from "@rian8337/osu-base";
import { Router } from "express";
import { getBeatmap } from "../utils/cache/beatmapStorage";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../structures/attributes/RawDifficultyAttributes";
import { CacheableDifficultyAttributes } from "../structures/attributes/CacheableDifficultyAttributes";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";
import { Util } from "../utils/Util";
import { DifficultyAttributesCacheManager } from "../utils/cache/difficultyattributes/DifficultyAttributesCacheManager";
import {
    liveDroidDifficultyCache,
    liveOsuDifficultyCache,
    rebalanceDroidDifficultyCache,
    rebalanceOsuDifficultyCache,
} from "../utils/cache/difficultyAtributesStorage";
import { PerformanceCalculationParameters } from "../utils/calculator/PerformanceCalculationParameters";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        key: string;
        beatmapid?: string;
        beatmaphash?: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcear?: string;
    }
>("/", Util.validateGETInternalKey, async (req, res) => {
    if (!req.query.beatmapid && !req.query.beatmaphash) {
        return res
            .status(400)
            .json({ error: "Neither beatmap ID or hash is specified" });
    }

    const mods = ModUtil.pcStringToMods(req.query.mods ?? "");
    const oldStatistics = req.query.oldstatistics !== undefined;

    const customSpeedMultiplier = MathUtils.clamp(
        parseFloat(req.query.customspeedmultiplier ?? "1"),
        0.5,
        2
    );
    if (Number.isNaN(customSpeedMultiplier)) {
        return res
            .status(400)
            .json({ error: "Invalid custom speed multiplier" });
    }

    const forceAR = req.query.forcear
        ? MathUtils.clamp(parseFloat(req.query.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR" });
    }

    const { beatmapid, beatmaphash, gamemode } = req.query;
    const calculationMethod = parseInt(req.query.calculationmethod);

    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode" });
    }

    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method" });
    }

    const apiBeatmap = await getBeatmap(
        beatmapid !== undefined ? parseInt(beatmapid) : beatmaphash!
    );

    if (!apiBeatmap) {
        return res.status(404).json({ error: "Beatmap not found" });
    }

    let difficultyAttributes: CacheableDifficultyAttributes<RawDifficultyAttributes> | null;
    let difficultyCacheManager: DifficultyAttributesCacheManager<RawDifficultyAttributes>;
    let difficultyCalculator:
        | BeatmapDroidDifficultyCalculator
        | BeatmapOsuDifficultyCalculator;
    const calculationParams = new PerformanceCalculationParameters(
        new Accuracy({ n300: apiBeatmap.objects }),
        apiBeatmap.maxCombo,
        undefined,
        new MapStats({
            mods: mods,
            ar: forceAR,
            speedMultiplier: customSpeedMultiplier,
            isForceAR: forceAR !== undefined && !isNaN(forceAR),
            oldStatistics: oldStatistics,
        })
    );

    const { customStatistics } = calculationParams;

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

    difficultyAttributes = difficultyCacheManager.getDifficultyAttributes(
        apiBeatmap,
        difficultyCacheManager.getAttributeName(
            customStatistics?.mods,
            customStatistics?.oldStatistics,
            customStatistics?.speedMultiplier,
            customStatistics?.isForceAR ? customStatistics.ar : undefined
        )
    );

    if (!difficultyAttributes) {
        const calculationResult = await (calculationMethod ===
        PPCalculationMethod.live
            ? difficultyCalculator.calculateBeatmapPerformance(
                  apiBeatmap,
                  calculationParams
              )
            : difficultyCalculator.calculateBeatmapRebalancePerformance(
                  apiBeatmap,
                  calculationParams
              )
        ).catch((e: Error) => e.message);

        if (typeof calculationResult === "string") {
            return res.status(503).json({ error: calculationResult });
        }

        difficultyAttributes = {
            ...calculationResult.difficultyAttributes,
            mods: undefined,
        };
    }

    res.json(difficultyAttributes);
});

export default router;
