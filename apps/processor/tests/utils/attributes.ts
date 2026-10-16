import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { ModMap, type Modes } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { readBeatmapFixture, type BeatmapFixtureName } from "./fixtures";

/**
 * Calculates real difficulty attributes for a fixture, for tests that need attributes but not a specific value.
 */
export function calculateFixtureDifficulty(
    name: BeatmapFixtureName,
    mode: Modes,
    mods = new ModMap(),
): CacheableDifficultyAttributes<IDifficultyAttributes> {
    const algorithm = createAlgorithm(mode);

    return algorithm.calculateDifficulty(
        algorithm.decodeBeatmap(readBeatmapFixture(name)),
        mods,
    );
}
