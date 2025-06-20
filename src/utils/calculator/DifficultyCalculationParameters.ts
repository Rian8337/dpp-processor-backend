import { ModMap } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import { parseOfficialScoreMods } from "../../database/official/officialDatabaseUtil";
import { scoresTable } from "../../database/official/schema";
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
     * Applies score data to this parameter.
     *
     * @param score The score.
     */
    applyScore(score: Score | Pick<typeof scoresTable.$inferSelect, "mode">) {
        this.mods =
            score instanceof Score
                ? score.mods
                : parseOfficialScoreMods(score.mode);
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
