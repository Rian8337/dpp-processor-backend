import { LiveDroidDifficultyAttributesCacheManager } from "./difficultyattributes/LiveDroidDifficultyAttributesCacheManager";
import { LiveOsuDifficultyAttributesCacheManager } from "./difficultyattributes/LiveOsuDifficultyAttributesCacheManager";
import { RebalanceDroidDifficultyAttributesCacheManager } from "./difficultyattributes/RebalanceDroidDifficultyAttributesCacheManager";
import { RebalanceOsuDifficultyAttributesCacheManager } from "./difficultyattributes/RebalanceOsuDifficultyAttributesCacheManager";

export const liveDroidDifficultyCache =
    new LiveDroidDifficultyAttributesCacheManager();

export const liveOsuDifficultyCache =
    new LiveOsuDifficultyAttributesCacheManager();

export const rebalanceDroidDifficultyCache =
    new RebalanceDroidDifficultyAttributesCacheManager();

export const rebalanceOsuDifficultyCache =
    new RebalanceOsuDifficultyAttributesCacheManager();
