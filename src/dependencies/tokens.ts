import { IBeatmapAPIProvider, IGameAPIProvider } from "@/api";
import { OfficialDb } from "@/database/official";
import { ProcessorDb } from "@/database/processor";
import { IReplayRepository } from "@/repositories";
import {
    IRecentPlayRepository,
    IUserBindRepository,
} from "@/repositories/mongodb";
import { IScoreRepository, IUserRepository } from "@/repositories/official";
import {
    IBeatmapRepository,
    ILiveDroidDifficultyAttributesRepository,
    ILiveOsuDifficultyAttributesRepository,
    IRebalanceDroidDifficultyAttributesRepository,
    IRebalanceOsuDifficultyAttributesRepository,
} from "@/repositories/processor";
import {
    IBeatmapService,
    ILiveDroidCalculationService,
    ILiveOsuCalculationService,
    IRebalanceDroidCalculationService,
    IRebalanceOsuCalculationService,
    IReplayService,
    IScoreService,
} from "@/services";
import { Db } from "mongodb";
import { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection.
 */
export const dependencyTokens = {
    //#region API Providers

    /**
     * Injection token for the beatmap API provider.
     */
    beatmapApiProvider: Symbol.for(
        "APIBeatmapProvider",
    ) as InjectionToken<IBeatmapAPIProvider>,

    /**
     * Injection token for the game API provider.
     */
    gameApiProvider: Symbol.for(
        "APIReplayProvider",
    ) as InjectionToken<IGameAPIProvider>,

    //#endregion

    //#region Databases

    /**
     * Injection token for the official database connection.
     */
    officialDb: Symbol.for("OfficialDb") as InjectionToken<OfficialDb>,

    /**
     * Injection token for the processor database connection.
     */
    processorDb: Symbol.for("ProcessorDb") as InjectionToken<ProcessorDb>,

    /**
     * Injection token for the Elaina database connection.
     */
    elainaDb: Symbol.for("ElainaDb") as InjectionToken<Db>,

    /**
     * Injection token for the Alice database connection.
     */
    aliceDb: Symbol.for("AliceDb") as InjectionToken<Db>,

    //#endregion

    //#region Repositories

    /**
     * Injection token for the beatmap repository.
     */
    beatmapRepository: Symbol.for(
        "ProcessorDB:BeatmapRepository",
    ) as InjectionToken<IBeatmapRepository>,

    /**
     * Injection token for the live osu!droid difficulty attributes repository.
     */
    liveDroidDifficultyAttributesRepository: Symbol.for(
        "ProcessorDB:LiveDroidDifficultyAttributesRepository",
    ) as InjectionToken<ILiveDroidDifficultyAttributesRepository>,

    /**
     * Injection token for the live osu! difficulty attributes repository.
     */
    liveOsuDifficultyAttributesRepository: Symbol.for(
        "ProcessorDB:LiveOsuDifficultyAttributesRepository",
    ) as InjectionToken<ILiveOsuDifficultyAttributesRepository>,

    /**
     * Injection token for the rebalance osu! difficulty attributes repository.
     */
    rebalanceDroidDifficultyAttributesRepository: Symbol.for(
        "ProcessorDB:RebalanceDroidDifficultyAttributesRepository",
    ) as InjectionToken<IRebalanceDroidDifficultyAttributesRepository>,

    /**
     * Injection token for the rebalance osu! difficulty attributes repository.
     */
    rebalanceOsuDifficultyAttributesRepository: Symbol.for(
        "ProcessorDB:RebalanceOsuDifficultyAttributesRepository",
    ) as InjectionToken<IRebalanceOsuDifficultyAttributesRepository>,

    /**
     * Injection token for the recent play repository.
     */
    recentPlayRepository: Symbol.for(
        "AliceDB:RecentPlayRepository",
    ) as InjectionToken<IRecentPlayRepository>,

    /**
     * Injection token for the replay repository.
     */
    replayRepository: Symbol.for(
        "ReplayRepository",
    ) as InjectionToken<IReplayRepository>,

    /**
     * Injection token for the official score repository.
     */
    scoreRepository: Symbol.for(
        "OfficialDB:ScoreRepository",
    ) as InjectionToken<IScoreRepository>,

    /**
     * Injection token for the user bind repository.
     */
    userBindRepository: Symbol.for(
        "ElainaDB:UserBindRepository",
    ) as InjectionToken<IUserBindRepository>,

    /**
     * Injection token for the official user repository.
     */
    userRepository: Symbol.for(
        "OfficialDB:UserRepository",
    ) as InjectionToken<IUserRepository>,

    //#endregion

    //#region Services

    /**
     * Injection token for the beatmap service.
     */
    beatmapService: Symbol.for(
        "BeatmapService",
    ) as InjectionToken<IBeatmapService>,

    /**
     * Injection token for the live osu!droid calculation service.
     */
    liveDroidCalculationService: Symbol.for(
        "LiveDroidCalculationService",
    ) as InjectionToken<ILiveDroidCalculationService>,

    /**
     * Injection token for the live osu! calculation service.
     */
    liveOsuCalculationService: Symbol.for(
        "LiveOsuCalculationService",
    ) as InjectionToken<ILiveOsuCalculationService>,

    /**
     * Injection token for the rebalance osu!droid calculation service.
     */
    rebalanceDroidCalculationService: Symbol.for(
        "RebalanceDroidCalculationService",
    ) as InjectionToken<IRebalanceDroidCalculationService>,

    /**
     * Injection token for the rebalance osu! calculation service.
     */
    rebalanceOsuCalculationService: Symbol.for(
        "RebalanceOsuCalculationService",
    ) as InjectionToken<IRebalanceOsuCalculationService>,

    /**
     * Injection token for the replay service.
     */
    replayService: Symbol.for(
        "ReplayService",
    ) as InjectionToken<IReplayService>,

    /**
     * Injection token for the score service.
     */
    scoreService: Symbol.for("ScoreService") as InjectionToken<IScoreService>,

    //#endregion
} as const;
