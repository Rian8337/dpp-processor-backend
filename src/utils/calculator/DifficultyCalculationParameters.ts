import { Mod, ModUtil } from "@rian8337/osu-base";
import { CloneableDifficultyCalculationParameters } from "./CloneableDifficultyCalculationParameters";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";

/**
 * Represents a parameter to alter difficulty calculation result.
 */
export interface DifficultyCalculationParametersInit {
    /**
     * The mods to calculate for. Defaults to No Mod.
     */
    mods?: Mod[];

    /**
     * The custom speed multiplier to calculate for. Defaults to 1.
     */
    customSpeedMultiplier?: number;

    /**
     * The circle size to enforce. Defaults to the beatmap's original circle size.
     */
    forceCS?: number;

    /**
     * The approach rate to enforce. Defaults to the beatmap's original approach rate.
     */
    forceAR?: number;

    /**
     * The overall difficulty to enforce. Defaults to the beatmap's original overall difficulty.
     */
    forceOD?: number;

    /**
     * The health drain to enforce. Defaults to the beatmap's original health drain.
     */
    forceHP?: number;

    /**
     * Whether to calculate for old statistics for osu!droid gamemode (1.6.7 and older). Defaults to `false`.
     */
    oldStatistics?: boolean;
}

/**
 * Represents a parameter to alter difficulty calculation result.
 */
export class DifficultyCalculationParameters {
    /**
     * Constructs a `DifficultyCalculationParameters` object from raw data.
     *
     * @param data The data.
     */
    static from(
        data: CloneableDifficultyCalculationParameters
    ): DifficultyCalculationParameters {
        return new this({
            ...data,
            mods: ModUtil.pcStringToMods(data.mods),
        });
    }

    /**
     * The mods to calculate for.
     */
    mods: Mod[];

    /**
     * The custom speed multiplier to calculate for.
     */
    customSpeedMultiplier: number;

    /**
     * The circle size to enforce. Defaults to the beatmap's original circle size.
     */
    forceCS?: number;

    /**
     * The approach rate to enforce. Defaults to the beatmap's original approach rate.
     */
    forceAR?: number;

    /**
     * The overall difficulty to enforce. Defaults to the beatmap's original overall difficulty.
     */
    forceOD?: number;

    /**
     * The health drain to enforce. Defaults to the beatmap's original health drain.
     */
    forceHP?: number;

    /**
     * Whether to calculate for old statistics for osu!droid gamemode (1.6.7 and older).
     */
    oldStatistics?: boolean;

    constructor(values?: DifficultyCalculationParametersInit) {
        this.mods = values?.mods ?? [];
        this.customSpeedMultiplier = values?.customSpeedMultiplier ?? 1;
        this.forceCS = values?.forceCS;
        this.forceAR = values?.forceAR;
        this.forceOD = values?.forceOD;
        this.forceHP = values?.forceHP;
        this.oldStatistics = values?.oldStatistics;
    }

    /**
     * Applies replay data to this parameter.
     *
     * @param replay The replay.
     */
    applyReplay(replay: ReplayAnalyzer) {
        const { data } = replay;

        if (!data) {
            return;
        }

        this.mods = data.convertedMods.slice();
        this.customSpeedMultiplier = data.speedMultiplier;
        this.forceCS = data.forceCS;
        this.forceAR = data.forceAR;
        this.forceOD = data.forceOD;
        this.forceHP = data.forceHP;
        this.oldStatistics = data.replayVersion <= 3;
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    toCloneable(): CloneableDifficultyCalculationParameters {
        return {
            mods: ModUtil.modsToOsuString(this.mods),
            customSpeedMultiplier: this.customSpeedMultiplier,
            forceCS: this.forceCS,
            forceAR: this.forceAR,
            forceOD: this.forceOD,
            forceHP: this.forceHP,
            oldStatistics: this.oldStatistics,
        };
    }
}
