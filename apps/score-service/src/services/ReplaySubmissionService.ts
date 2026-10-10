import type { IBeatmapServiceClient } from "@/clients/IBeatmapServiceClient";
import type { IDiscordMetadataClient } from "@/clients/IDiscordMetadataClient";
import type { ReplayPerformanceBody } from "@/clients/schemas";
import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ReplayParser } from "@/replays/parseReplay";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import type { IRecentPlayRepository } from "@/repositories/IRecentPlayRepository";
import type { IUserBindRepository } from "@/repositories/IUserBindRepository";
import { RetryLaterError } from "@/types/errors";
import { requireValue, type UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import { basename } from "node:path";
import { inject } from "tsyringe";
import type { IDanCourseService } from "./IDanCourseService";
import type {
    IReplaySubmissionService,
    SubmissionResult,
} from "./IReplaySubmissionService";
import type { IScoreCalculator } from "./IScoreCalculator";
import { toRecentPlay } from "./recentPlay";

@Injectable(dependencyTokens.replaySubmissionService)
export class ReplaySubmissionService implements IReplaySubmissionService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly beatmaps: IBeatmapServiceClient,
        @inject(dependencyTokens.recentPlayRepository)
        private readonly recentPlays: IRecentPlayRepository,
        @inject(dependencyTokens.userBindRepository)
        private readonly binds: IUserBindRepository,
        @inject(dependencyTokens.danCourseService)
        private readonly danCourses: IDanCourseService,
        @inject(dependencyTokens.discordMetadataClient)
        private readonly discord: IDiscordMetadataClient,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
        @inject(dependencyTokens.cliConfig) private readonly config: CliConfig,
    ) {}

    async process(fileName: string, file: Buffer): Promise<SubmissionResult> {
        try {
            return await this.submit(fileName, file);
        } catch (e) {
            return {
                action: "keep",
                reason: e instanceof Error ? e.message : String(e),
                ...(e instanceof RetryLaterError &&
                    e.retryAfterMs !== undefined && {
                        retryAfterMs: e.retryAfterMs,
                    }),
            };
        }
    }

    private async submit(
        fileName: string,
        file: Buffer,
    ): Promise<SubmissionResult> {
        const replay = await this.parse(file);

        if (!replay?.v3) {
            return { action: "delete", reason: "unreadable or older than v3" };
        }

        const uid = await this.official.findUserId(replay.v3.playerName);

        if (uid === null) {
            return { action: "delete", reason: "unknown player" };
        }

        const { liveDroid, liveOsu } = this.config.variants;
        const droid = this.attributes(
            await this.calculator.calculateReplay(liveDroid, file),
            liveDroid,
        );
        const osu = this.attributes(
            await this.calculator.calculateReplay(liveOsu, file),
            liveOsu,
        );
        const beatmap = requireValue(
            await this.beatmaps.getBeatmap("priority", replay.hash),
        );
        const title = beatmap?.title ?? replay.fileName.replace(".osu", "");

        await this.danCourses.submit(uid, replay);

        const discordId = await this.binds.findDiscordId(uid);

        if (discordId) {
            await this.recentPlays.insert(
                toRecentPlay({
                    uid,
                    scoreId: scoreIdOf(fileName),
                    replay,
                    title,
                    droid,
                    osu,
                    date: new Date(),
                }),
            );

            if (!(await this.discord.update(discordId))) {
                console.log(
                    `Discord metadata update failed for player ${uid.toString()}`,
                );
            }
        }

        return { action: "delete", reason: "processed" };
    }

    /**
     * The calculation, or null (logged) if it failed permanently.
     *
     * @throws {RetryLaterError} If the broker asks to retry.
     */
    private attributes(
        result: UpstreamResult<ReplayPerformanceBody>,
        variant: string,
    ) {
        const value = requireValue(result);

        if (!result.ok) {
            console.log(
                `Replay calculation with ${variant} failed: ${result.code} ${result.message}`,
            );
        }

        return value;
    }
}

/**
 * `<score id>_<rest>.odr` gives the score ID; any other name gives 0, as before.
 */
export function scoreIdOf(fileName: string): number {
    const parts = basename(fileName).split("_");
    const id = parts.length === 2 ? Number.parseInt(parts[0]!, 10) : 0;

    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
