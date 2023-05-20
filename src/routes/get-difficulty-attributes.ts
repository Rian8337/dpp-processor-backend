import { MapStats, MathUtils, ModUtil, Modes } from "@rian8337/osu-base";
import { Router } from "express";
import { getBeatmap } from "../utils/cache/beatmapStorage";
import { PPCalculationMethod } from "../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../structures/difficultyattributes/RawDifficultyAttributes";
import { CacheableDifficultyAttributes } from "../structures/difficultyattributes/CacheableDifficultyAttributes";
import { BeatmapDroidDifficultyCalculator } from "../utils/calculator/BeatmapDroidDifficultyCalculator";
import { DifficultyCalculationParameters } from "../utils/calculator/DifficultyCalculationParameters";
import { BeatmapOsuDifficultyCalculator } from "../utils/calculator/BeatmapOsuDifficultyCalculator";

const router = Router();

router.get<
    "/",
    unknown,
    unknown,
    unknown,
    {
        beatmaphash: string;
        gamemode: string;
        calculationmethod: string;
        mods?: string;
        oldstatistics?: string;
        customspeedmultiplier?: string;
        forcear?: string;
    }
>("/", async (req, res) => {
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
            .json({ error: "Invalid custom speed multiplier." });
    }

    const forceAR = req.query.forcear
        ? MathUtils.clamp(parseFloat(req.query.forcear), 0, 12.5)
        : undefined;
    if (forceAR !== undefined && Number.isNaN(forceAR)) {
        return res.status(400).json({ error: "Invalid force AR." });
    }

    const { beatmaphash, gamemode } = req.query;
    const calculationMethod = parseInt(req.query.calculationmethod);

    if (gamemode !== Modes.droid && gamemode !== Modes.osu) {
        return res.status(400).json({ error: "Invalid gamemode." });
    }

    if (
        calculationMethod !== PPCalculationMethod.live &&
        calculationMethod !== PPCalculationMethod.rebalance
    ) {
        return res.status(400).json({ error: "Invalid calculation method." });
    }

    const beatmap = await getBeatmap(beatmaphash, {
        checkFile: false,
    });

    if (!beatmap) {
        return res.status(404).json({ error: "Beatmap not found." });
    }

    let difficultyAttributes: CacheableDifficultyAttributes<RawDifficultyAttributes> | null;
    let difficultyCalculator:
        | BeatmapDroidDifficultyCalculator
        | BeatmapOsuDifficultyCalculator;
    const calculationParams = new DifficultyCalculationParameters(
        new MapStats({
            mods: mods,
            ar: forceAR,
            speedMultiplier: customSpeedMultiplier,
            isForceAR: forceAR !== undefined && !isNaN(forceAR),
            oldStatistics: oldStatistics,
        })
    );

    switch (gamemode) {
        case Modes.droid:
            difficultyCalculator = new BeatmapDroidDifficultyCalculator();
            break;
        case Modes.osu:
            difficultyCalculator = new BeatmapOsuDifficultyCalculator();
            break;
    }

    switch (calculationMethod) {
        case PPCalculationMethod.live: {
            const difficultyCalculationResult =
                await difficultyCalculator.calculateBeatmapDifficulty(
                    beatmap,
                    calculationParams
                );

            difficultyAttributes =
                difficultyCalculationResult?.cachedAttributes ?? null;
            break;
        }
        case PPCalculationMethod.rebalance: {
            const difficultyCalculationResult =
                await difficultyCalculator.calculateBeatmapRebalanceDifficulty(
                    beatmap,
                    calculationParams
                );

            difficultyAttributes =
                difficultyCalculationResult?.cachedAttributes ?? null;
            break;
        }
    }

    if (!difficultyAttributes) {
        return res.status(500).json({ error: "Internal server error." });
    }

    res.json(difficultyAttributes);
});

export default router;
