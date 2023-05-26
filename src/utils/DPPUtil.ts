import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { Player, Score } from "@rian8337/osu-droid-utilities";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
} from "@rian8337/osu-difficulty-calculator";
import { getBeatmap } from "./cache/beatmapStorage";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { BeatmapDroidDifficultyCalculator } from "./calculator/BeatmapDroidDifficultyCalculator";
import { MapInfo, MathUtils, RankedStatus } from "@rian8337/osu-base";
import { PerformanceCalculationResult } from "./calculator/PerformanceCalculationResult";
import { DPPSubmissionValidity } from "../enums/DPPSubmissionValidity";
import { WhitelistUtil } from "./WhitelistUtil";
import { PPEntry } from "../structures/PPEntry";
import { PPSubmissionStatus } from "../structures/PPSubmissionStatus";
import { persistReplay, saveReplay } from "./replaySavingManager";

/**
 * Utilities that are related to dpp.
 */
export abstract class DPPUtil {
    /**
     * Submits replays to the dpp database.
     *
     * @param replays The replays to submit.
     * @param uid The uid of the player, if any.
     * @returns Whether the submission for each replay was successful.
     */
    static async submitReplay(
        replays: ReplayAnalyzer[],
        uid?: number
    ): Promise<PPSubmissionStatus[]> {
        const statuses: PPSubmissionStatus[] = [];

        const preFillStatuses = (message: PPSubmissionStatus): void => {
            while (statuses.length < replays.length) {
                statuses.push(message);
            }
        };

        if (uid === undefined) {
            for (const replay of replays) {
                if (!replay.data?.playerName) {
                    statuses.push({
                        success: false,
                        reason: "Replay does not have any player name",
                    });
                    continue;
                }

                const player = await Player.getInformation(
                    replay.data.playerName
                );

                if (!player) {
                    statuses.push({
                        success: false,
                        reason: "Player not found",
                    });
                    continue;
                }

                uid = player.uid;
            }

            if (!uid) {
                preFillStatuses({
                    success: false,
                    reason: "Player not found",
                });

                return statuses;
            }
        }

        if (
            await DatabaseManager.elainaDb.collections.dppBan.isPlayerBanned(
                uid
            )
        ) {
            preFillStatuses({
                success: false,
                reason: "Player is banned from system",
            });

            return statuses;
        }

        const bindInfo =
            await DatabaseManager.elainaDb.collections.userBind.getFromUid(uid);

        if (!bindInfo) {
            preFillStatuses({
                success: false,
                reason: "Bind information not found",
            });

            return statuses;
        }

        for (const replay of replays) {
            const { data, originalODR } = replay;
            if (!data || !originalODR) {
                statuses.push({
                    success: false,
                    reason: "No replay data found",
                });
                continue;
            }

            const beatmapInfo = await getBeatmap(data.hash, {
                checkFile: false,
            });

            if (!beatmapInfo) {
                statuses.push({ success: false, reason: "Beatmap not found" });
                continue;
            }

            const submissionValidity = await this.checkSubmissionValidity(
                beatmapInfo
            );
            if (submissionValidity !== DPPSubmissionValidity.valid) {
                let reason: string;
                switch (submissionValidity) {
                    case DPPSubmissionValidity.beatmapNotFound:
                        reason = "Beatmap not found";
                        break;
                    case DPPSubmissionValidity.beatmapTooShort:
                        reason = "Beatmap too short";
                        break;
                    case DPPSubmissionValidity.beatmapIsBlacklisted:
                        reason = "Beatmap is blacklisted";
                        break;
                    case DPPSubmissionValidity.beatmapNotWhitelisted:
                        reason = "Beatmap is not whitelisted";
                        break;
                    case DPPSubmissionValidity.scoreUsesForceAR:
                        reason = "Score uses force AR";
                        break;
                }

                statuses.push({ success: false, reason: reason });
                continue;
            }

            // Instruct the replay backend to save the replay.
            const saveReplayStatus = await saveReplay(uid, replay);
            if (!saveReplayStatus) {
                statuses.push({
                    success: false,
                    reason: "Replay saving failed",
                });

                continue;
            }

            const performanceCalculationResult =
                await new BeatmapDroidDifficultyCalculator().calculateReplayPerformance(
                    replay
                );

            if (!performanceCalculationResult) {
                statuses.push({
                    success: false,
                    reason: "Performance points calculation failed",
                });

                continue;
            }

            const ppEntry = DPPUtil.scoreToPPEntry(
                beatmapInfo,
                uid,
                data,
                performanceCalculationResult
            );

            let replayNeedsPersistence = false;

            if (this.checkScoreInsertion(bindInfo.pp, ppEntry)) {
                await beatmapInfo.retrieveBeatmapFile();

                if (!beatmapInfo.hasDownloadedBeatmap()) {
                    statuses.push({
                        success: false,
                        reason: "Beatmap file could not be downloaded",
                    });
                }

                await BeatmapDroidDifficultyCalculator.applyTapPenalty(
                    replay,
                    performanceCalculationResult
                );

                await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                    replay,
                    performanceCalculationResult
                );

                ppEntry.pp = MathUtils.round(
                    performanceCalculationResult.result.total,
                    2
                );

                replayNeedsPersistence = this.insertScore(bindInfo.pp, ppEntry);
            }

            if (replayNeedsPersistence) {
                const persistenceResult = await persistReplay(
                    bindInfo.uid,
                    replay
                );

                if (!persistenceResult) {
                    statuses.push({
                        success: false,
                        reason: "Replay persistence failed",
                    });

                    continue;
                }
            }

            statuses.push({
                success: true,
                replayNeedsPersistence: replayNeedsPersistence,
            });
        }

        const updateResult = await DatabaseManager.elainaDb.collections.userBind
            .updateOne(
                { discordid: bindInfo.discordid },
                {
                    $set: {
                        pptotal: this.calculateFinalPerformancePoints(
                            bindInfo.pp
                        ),
                        pp: bindInfo.pp,
                        weightedAccuracy: this.calculateWeightedAccuracy(
                            bindInfo.pp
                        ),
                    },
                    $inc: {
                        playc: statuses.filter((v) => v.success).length,
                    },
                }
            )
            .catch(() => null);

        if (!updateResult) {
            statuses.length = 0;

            preFillStatuses({
                success: false,
                reason: "Score submission to database failed",
            });

            return statuses;
        }

        await this.updateDiscordMetadata(bindInfo.discordid);

        return statuses;
    }

    /**
     * Checks a beatmap's submission validity.
     *
     * @param beatmap The beatmap.
     * @returns The validity of the beatmap.
     */
    static async checkSubmissionValidity(
        beatmap: MapInfo
    ): Promise<DPPSubmissionValidity>;

    /**
     * Checks a score's submission validity.
     *
     * @param score The score.
     * @returns The validity of the score.
     */
    static async checkSubmissionValidity(
        score: Score
    ): Promise<DPPSubmissionValidity>;

    static async checkSubmissionValidity(
        beatmapOrScore: Score | MapInfo
    ): Promise<DPPSubmissionValidity> {
        const beatmapInfo =
            beatmapOrScore instanceof MapInfo
                ? beatmapOrScore
                : await getBeatmap(beatmapOrScore.hash, {
                      checkFile: false,
                  });

        if (!beatmapInfo) {
            return DPPSubmissionValidity.beatmapNotFound;
        }

        switch (true) {
            case beatmapOrScore instanceof Score &&
                beatmapOrScore.forcedAR !== undefined:
                return DPPSubmissionValidity.scoreUsesForceAR;
            case beatmapInfo.approved === RankedStatus.loved &&
                (beatmapInfo.hitLength < 30 ||
                    beatmapInfo.hitLength / beatmapInfo.totalLength < 0.6):
                return DPPSubmissionValidity.beatmapTooShort;
            case await WhitelistUtil.isBlacklisted(beatmapInfo.beatmapID):
                return DPPSubmissionValidity.beatmapIsBlacklisted;
            case WhitelistUtil.beatmapNeedsWhitelisting(beatmapInfo.approved) &&
                (await WhitelistUtil.getBeatmapWhitelistStatus(
                    beatmapInfo.hash
                )) !== "updated":
                return DPPSubmissionValidity.beatmapNotWhitelisted;
            default:
                return DPPSubmissionValidity.valid;
        }
    }

    /**
     * Calculates the final performance points from a list of pp entries.
     *
     * @param list The list.
     * @returns The final performance points.
     */
    static calculateFinalPerformancePoints(list: PPEntry[]): number {
        list.sort((a, b) => b.pp - a.pp);

        return list.reduce((a, v, i) => a + v.pp * Math.pow(0.95, i), 0);
    }

    /**
     * Calculates the weighted accuracy of a dpp list.
     *
     * @param list The list.
     * @returns The weighted accuracy of the list.
     */
    static calculateWeightedAccuracy(list: PPEntry[]): number {
        if (list.length === 0) {
            return 0;
        }

        let accSum = 0;
        let weight = 0;
        let i = 0;

        for (const pp of list.values()) {
            accSum += pp.accuracy * Math.pow(0.95, i);
            weight += Math.pow(0.95, i);
            ++i;
        }

        return accSum / weight;
    }

    /**
     * Checks whether a PP entry will be kept once it's entered to a list.
     *
     * @param list The list of dpp plays.
     * @param entry The entry to check.
     * @returns Whether the PP entry will be kept.
     */
    private static checkScoreInsertion(
        list: PPEntry[],
        entry: PPEntry
    ): boolean {
        if (list.length < 75) {
            return true;
        }

        for (let i = 0; i < list.length; ++i) {
            const l = list[i];

            if (l.hash === entry.hash && l.pp >= entry.pp) {
                return false;
            }
        }

        return list[list.length - 1].pp < entry.pp;
    }

    /**
     * Converts a calculation result to PP entry.
     *
     * @param beatmap The beatmap.
     * @param playerId The ID of the player.
     * @param replayData The replay data.
     * @param calculationResult The dpp calculation result of the beatmap.
     * @returns A PP entry from the beatmap and calculation result.
     */
    private static scoreToPPEntry(
        beatmap: MapInfo,
        playerId: number,
        replayData: ReplayData,
        calculationResult: PerformanceCalculationResult<
            DroidDifficultyCalculator,
            DroidPerformanceCalculator
        >
    ): PPEntry {
        return {
            uid: playerId,
            hash: beatmap.hash,
            title: beatmap.fullTitle,
            pp: MathUtils.round(calculationResult.result.total, 2),
            mods: calculationResult.result.difficultyAttributes.mods.reduce(
                (a, v) => a + v.acronym,
                ""
            ),
            accuracy: MathUtils.round(
                calculationResult.params.accuracy.value() * 100,
                2
            ),
            combo: calculationResult.params.combo ?? beatmap.maxCombo,
            miss: calculationResult.params.accuracy.nmiss,
            speedMultiplier:
                replayData.speedModification !== 1
                    ? replayData.speedModification
                    : undefined,
            forcedAR: replayData.forcedAR,
        };
    }

    /**
     * Inserts a score into a list of dpp plays.
     *
     * @param list The list of dpp plays.
     * @param entry The play to add.
     * @returns Whether the replay file associated with the play needs to be persisted.
     */
    private static insertScore(list: PPEntry[], entry: PPEntry): boolean {
        if (isNaN(entry.pp)) {
            return false;
        }

        if (list.length >= 75 && list[list.length - 1].pp >= entry.pp) {
            return false;
        }

        let found = false;
        let needsSorting = false;

        for (let i = 0; i < list.length; ++i) {
            if (list[i].hash === entry.hash && list[i].pp < entry.pp) {
                found = true;
                list[i] = entry;
                break;
            }
        }

        if (!found) {
            list.push(entry);
        }

        needsSorting = true;

        if (needsSorting) {
            list.sort((a, b) => b.pp - a.pp);
        }

        let replayNeedsPersistence = true;
        while (list.length > 75) {
            if (list[list.length - 1].hash === entry.hash) {
                replayNeedsPersistence = false;
            }

            list.pop();
        }

        return replayNeedsPersistence;
    }

    /**
     * Updates the Discord metadata of a user.
     *
     * @param userId The ID of the user.
     * @returns Whether the request was successful.
     */
    private static async updateDiscordMetadata(
        userId: string
    ): Promise<boolean> {
        const formData = new FormData();
        formData.append("userId", userId);
        formData.append("key", process.env.DISCORD_OAUTH_BACKEND_INTERNAL_KEY!);

        return fetch("http://127.0.0.1:3004/api/discord/update-metadata", {
            method: "POST",
            body: formData,
        })
            .then(() => true)
            .catch(() => false);
    }
}
