import { Mod, ModUtil } from "@rian8337/osu-base";
import { CloneableDifficultyCalculationParameters } from "./CloneableDifficultyCalculationParameters";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";

/**
 * Represents a parameter to alter difficulty calculation result.
 */
export class DifficultyCalculationParameters {
    /**
     * The mods to calculate for.
     */
    mods: Mod[];

    constructor(mods: Mod[] = []) {
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

        this.mods = data.convertedMods.slice();
    }

    /**
     * Returns a cloneable form of this parameter.
     */
    toCloneable(): CloneableDifficultyCalculationParameters {
        return {
            mods: ModUtil.serializeMods(this.mods),
        };
    }
}
