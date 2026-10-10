import type { CliConfig, Config } from "@/config/config";
import type { IBeatmapServiceClient } from "@/clients/IBeatmapServiceClient";
import type { IBrokerClient } from "@/clients/IBrokerClient";
import type { IDiscordMetadataClient } from "@/clients/IDiscordMetadataClient";
import type { Database } from "@/database/types";
import type { OfficialDatabase } from "@/official/connection";
import type { OfficialTables } from "@/official/schema";
import type { IJobProgressRepository } from "@/repositories/IJobProgressRepository";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IDanCourseRepository } from "@/repositories/IDanCourseRepository";
import type { IRecentPlayRepository } from "@/repositories/IRecentPlayRepository";
import type { ReplayParser } from "@/replays/parseReplay";
import type { IReplayStore } from "@/replays/IReplayStore";
import type { IDanCourseService } from "@/services/IDanCourseService";
import type { IGamePPService } from "@/services/IGamePPService";
import type { IReplaySubmissionService } from "@/services/IReplaySubmissionService";
import type { IBestScoreWriter } from "@/services/IBestScoreWriter";
import type { IOnlineScoreService } from "@/services/IOnlineScoreService";
import type { IScoreCalculator } from "@/services/IScoreCalculator";
import type { IUserBindRepository } from "@/repositories/IUserBindRepository";
import type { Db } from "mongodb";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    /**
     * The server's config. Classes the CLI also uses depend on `cliConfig` instead.
     */
    config: Symbol.for("config") as InjectionToken<Config>,
    cliConfig: Symbol.for("cliConfig") as InjectionToken<CliConfig>,
    db: Symbol.for("db") as InjectionToken<Database>,
    jobProgressRepository: Symbol.for(
        "jobProgressRepository",
    ) as InjectionToken<IJobProgressRepository>,
    officialDb: Symbol.for("officialDb") as InjectionToken<OfficialDatabase>,
    officialTables: Symbol.for(
        "officialTables",
    ) as InjectionToken<OfficialTables>,
    officialScoreRepository: Symbol.for(
        "officialScoreRepository",
    ) as InjectionToken<IOfficialScoreRepository>,
    aliceDb: Symbol.for("aliceDb") as InjectionToken<Db>,
    elainaDb: Symbol.for("elainaDb") as InjectionToken<Db>,
    recentPlayRepository: Symbol.for(
        "recentPlayRepository",
    ) as InjectionToken<IRecentPlayRepository>,
    danCourseRepository: Symbol.for(
        "danCourseRepository",
    ) as InjectionToken<IDanCourseRepository>,
    userBindRepository: Symbol.for(
        "userBindRepository",
    ) as InjectionToken<IUserBindRepository>,
    brokerClient: Symbol.for("brokerClient") as InjectionToken<IBrokerClient>,
    beatmapServiceClient: Symbol.for(
        "beatmapServiceClient",
    ) as InjectionToken<IBeatmapServiceClient>,
    discordMetadataClient: Symbol.for(
        "discordMetadataClient",
    ) as InjectionToken<IDiscordMetadataClient>,
    replayStore: Symbol.for("replayStore") as InjectionToken<IReplayStore>,
    scoreCalculator: Symbol.for(
        "scoreCalculator",
    ) as InjectionToken<IScoreCalculator>,
    bestScoreWriter: Symbol.for(
        "bestScoreWriter",
    ) as InjectionToken<IBestScoreWriter>,
    replayParser: Symbol.for("replayParser") as InjectionToken<ReplayParser>,
    onlineScoreService: Symbol.for(
        "onlineScoreService",
    ) as InjectionToken<IOnlineScoreService>,
    gamePPService: Symbol.for(
        "gamePPService",
    ) as InjectionToken<IGamePPService>,
    danCourseService: Symbol.for(
        "danCourseService",
    ) as InjectionToken<IDanCourseService>,
    replaySubmissionService: Symbol.for(
        "replaySubmissionService",
    ) as InjectionToken<IReplaySubmissionService>,
} satisfies Record<string, InjectionToken<unknown>>;
