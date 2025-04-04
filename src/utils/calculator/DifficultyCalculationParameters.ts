import { ModMap } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { CloneableDifficultyCalculationParameters } from "./CloneableDifficultyCalculationParameters";

/**
 * Represents a parameter to alter difficulty calculation result.
 */
export class DifficultyCalculationParameters {
    /**
     * The mods to calculate for.
     */
    mods: ModMap;

    constructor(mods = new ModMap()) {
        this.mods = mods;
    }

    /**
     * Applies replay data to this parameter.
     *
     * @param replay The replay.
     */
    applyReplay(replay: ReplayAnalyzer) {
        const { data } = replay;

        if (!data?.isReplayV3()) {
            return;
        }

        this.mods = data.convertedMods;
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    toCloneable(): CloneableDifficultyCalculationParameters {
        return {
            mods: this.mods.serializeMods(),
        };
    }
}
