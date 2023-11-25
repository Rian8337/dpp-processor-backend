import { MapStats, ModUtil } from "@rian8337/osu-base";
import { CloneableDifficultyCalculationParameters } from "./CloneableDifficultyCalculationParameters";

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
        return new this(
            new MapStats({
                ...data.customStatistics,
                mods: ModUtil.pcStringToMods(data.customStatistics?.mods ?? ""),
            })
        );
    }

    /**
     * Statistics to apply forced map statistics, mods, custom speed multiplier,
     * as well as NightCore mod penalty for replay version 3 or older.
     */
    customStatistics?: MapStats;

    /**
     * @param customStatistics Custom statistics to apply mods, custom speed multiplier and force AR as well as NightCore mod penalty for replay version 3 or older.
     */
    constructor(customStatistics?: MapStats) {
        this.customStatistics = customStatistics;
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    toCloneable(): CloneableDifficultyCalculationParameters {
        return {
            customStatistics: {
                cs: this.customStatistics?.cs,
                ar: this.customStatistics?.ar,
                od: this.customStatistics?.od,
                hp: this.customStatistics?.hp,
                mods: this.customStatistics?.mods.reduce(
                    (a, v) => a + v.acronym,
                    ""
                ),
                speedMultiplier: this.customStatistics?.speedMultiplier,
                forceCS: this.customStatistics?.forceCS,
                forceAR: this.customStatistics?.forceAR,
                forceOD: this.customStatistics?.forceOD,
                forceHP: this.customStatistics?.forceHP,
                oldStatistics: this.customStatistics?.oldStatistics,
            },
        };
    }
}
