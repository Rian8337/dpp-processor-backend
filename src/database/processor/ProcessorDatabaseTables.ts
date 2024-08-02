/**
 * Available table names in the processor's database.
 */
export enum ProcessorDatabaseTables {
    beatmap = "beatmap",
    liveDroidDifficultyAttributes = "live_droid_difficulty_attributes",
    rebalanceDroidDifficultyAttributes = "rebalance_droid_difficulty_attributes",
    liveOsuDifficultyAttributes = "live_osu_difficulty_attributes",
    rebalanceOsuDifficultyAttributes = "rebalance_osu_difficulty_attributes",
    replayTransfer = "replay_transfer",
    beatmapCachePopulation = "beatmap_cache_population",
    totalPPCalculation = "total_pp_calculation",
}
