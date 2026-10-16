import type { ModMap } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type { ResolvedBeatmap } from "./IBeatmapService";

/**
 * Read-through cache for difficulty attributes: memory, then the database, then calculation.
 */
export interface IDifficultyCacheService {
    /**
     * Gets difficulty attributes. The returned attributes carry only the difficulty-adjusting mods; callers must
     * put the requested mods back before calculating performance.
     */
    get(
        beatmap: ResolvedBeatmap,
        mods: ModMap,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>>;
}
