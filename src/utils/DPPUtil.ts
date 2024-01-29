import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { Player, Score } from "@rian8337/osu-droid-utilities";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
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
import {
    deleteUnprocessedReplay,
    persistReplay,
    saveReplay,
    unprocessedReplayDirectory,
    wasBeatmapSubmitted,
} from "./replayManager";
import { PPSubmissionOperationResult } from "../structures/PPSubmissionOperationResult";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "./calculator/BeatmapOsuDifficultyCalculator";
import { IRecentPlay } from "../database/structures/aliceDb/IRecentPlay";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { readFile, readdir } from "fs/promises";
import { basename, join } from "path";
import { watch } from "chokidar";

/**
 * Utilities that are related to dpp.
 */
export abstract class DPPUtil {
    private static readonly droidDifficultyCalculator =
        new BeatmapDroidDifficultyCalculator();
    private static readonly osuDifficultyCalculator =
        new BeatmapOsuDifficultyCalculator();

    /**
     * Submits replays to the dpp database.
     *
     * @param replays The replays to submit.
     * @param uid The uid of the player, if any.
     * @param submitAsRecent Whether to submit these replays as recent plays. Defaults to `false`.
     * @returns Whether the submission for each replay was successful.
     */
    static async submitReplay(
        replays: ReplayAnalyzer[],
        uid?: number,
        submitAsRecent?: boolean
    ): Promise<PPSubmissionOperationResult> {
        const statuses: PPSubmissionStatus[] = [];
        const recentPlays: IRecentPlay[] = [];
        let playCountIncrement = 0;

        const preFillStatuses = (message: PPSubmissionStatus): void => {
            while (statuses.length < replays.length) {
                statuses.push(message);
            }
        };

        const insertRecentScore = (
            replayData: ReplayData,
            apiBeatmap?: MapInfo,
            droidAttribs?: PerformanceCalculationResult<
                DroidDifficultyAttributes,
                DroidPerformanceAttributes
            >,
            osuAttribs?: PerformanceCalculationResult<
                OsuDifficultyAttributes,
                OsuPerformanceAttributes
            >
        ) => {
            const recentPlay: IRecentPlay = {
                uid: uid!,
                accuracy: {
                    ...replayData.accuracy,
                },
                title:
                    apiBeatmap?.fullTitle ??
                    replayData.fileName.replace(".osu", ""),
                combo: replayData.maxCombo,
                date: new Date(),
                score: replayData.score,
                rank: replayData.rank,
                mods: replayData.convertedMods.reduce(
                    (a, v) => a + v.acronym,
                    ""
                ),
                hash: apiBeatmap?.hash ?? replayData.hash,
            };

            if (droidAttribs) {
                recentPlay.droidAttribs = {
                    params: droidAttribs.params.toCloneable(),
                    difficulty: {
                        ...droidAttribs.difficultyAttributes,
                        mods: droidAttribs.difficultyAttributes.mods.reduce(
                            (a, v) => a + v.acronym,
                            ""
                        ),
                    },
                    performance: {
                        total: droidAttribs.result.total,
                        aim: droidAttribs.result.aim,
                        tap: droidAttribs.result.tap,
                        accuracy: droidAttribs.result.accuracy,
                        flashlight: droidAttribs.result.flashlight,
                        visual: droidAttribs.result.visual,
                        deviation: droidAttribs.result.deviation,
                        tapDeviation: droidAttribs.result.tapDeviation,
                        tapPenalty: droidAttribs.result.tapPenalty,
                        aimSliderCheesePenalty:
                            droidAttribs.result.aimSliderCheesePenalty,
                        flashlightSliderCheesePenalty:
                            droidAttribs.result.flashlightSliderCheesePenalty,
                        visualSliderCheesePenalty:
                            droidAttribs.result.visualSliderCheesePenalty,
                    },
                };

                if (droidAttribs.replay) {
                    if (droidAttribs.replay.hitError) {
                        recentPlay.hitError = droidAttribs.replay.hitError;
                    }
                    recentPlay.sliderTickInformation =
                        droidAttribs.replay.sliderTickInformation;
                    recentPlay.sliderEndInformation =
                        droidAttribs.replay.sliderEndInformation;
                }
            }

            if (osuAttribs) {
                recentPlay.osuAttribs = {
                    params: osuAttribs.params.toCloneable(),
                    difficulty: {
                        ...osuAttribs.difficultyAttributes,
                        mods: osuAttribs.difficultyAttributes.mods.reduce(
                            (a, v) => a + v.acronym,
                            ""
                        ),
                    },
                    performance: {
                        total: osuAttribs.result.total,
                        aim: osuAttribs.result.aim,
                        speed: osuAttribs.result.speed,
                        accuracy: osuAttribs.result.accuracy,
                        flashlight: osuAttribs.result.flashlight,
                    },
                };
            }

            if (replayData.speedMultiplier !== 1) {
                recentPlay.speedMultiplier = replayData.speedMultiplier;
            }

            if (replayData.forceCS !== undefined) {
                recentPlay.forceCS = replayData.forceCS;
            }
            if (replayData.forceAR !== undefined) {
                recentPlay.forceAR = replayData.forceAR;
            }
            if (replayData.forceOD !== undefined) {
                recentPlay.forceOD = replayData.forceOD;
            }
            if (replayData.forceHP !== undefined) {
                recentPlay.forceHP = replayData.forceHP;
            }

            // Re-set date to update to current date
            recentPlay.date = new Date();
            recentPlays.push(recentPlay);
        };

        if (uid === undefined) {
            for (const replay of replays) {
                if (!replay.data?.playerName) {
                    statuses.push({
                        success: false,
                        reason: "Replay does not have any player name",
                        pp: 0,
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
                        pp: 0,
                    });
                    continue;
                }

                uid = player.uid;
                break;
            }

            if (!uid) {
                preFillStatuses({
                    success: false,
                    reason: "Player not found",
                    pp: 0,
                });

                return {
                    ppGained: 0,
                    newTotalPP: 0,
                    playCountIncrement: 0,
                    statuses: statuses,
                };
            }
        }

        const isBanned =
            await DatabaseManager.elainaDb.collections.dppBan.isPlayerBanned(
                uid
            );

        if (isBanned && !submitAsRecent) {
            preFillStatuses({
                success: false,
                reason: "Player is banned from system",
                pp: 0,
            });

            return {
                ppGained: 0,
                newTotalPP: 0,
                playCountIncrement: 0,
                statuses: statuses,
            };
        }

        const bindInfo =
            await DatabaseManager.elainaDb.collections.userBind.getFromUid(uid);

        if (!bindInfo) {
            preFillStatuses({
                success: false,
                reason: "Bind information not found",
                pp: 0,
            });

            return {
                ppGained: 0,
                newTotalPP: 0,
                playCountIncrement: 0,
                statuses: statuses,
            };
        }

        for (const replay of replays) {
            const { data, originalODR } = replay;
            if (!data || !originalODR) {
                statuses.push({
                    success: false,
                    reason: "No replay data found",
                    pp: 0,
                });
                continue;
            }

            const submitToRecent = submitAsRecent && replay.scoreID === 0;
            const apiBeatmap = await getBeatmap(data.hash);

            if (!apiBeatmap) {
                statuses.push({
                    success: false,
                    reason: "Beatmap not found",
                    pp: 0,
                });

                if (submitToRecent) {
                    insertRecentScore(data);
                }

                continue;
            }

            const droidAttribs = await this.droidDifficultyCalculator
                .calculateReplayPerformance(replay)
                .catch((e: Error) => e.message);

            if (typeof droidAttribs === "string") {
                statuses.push({
                    success: false,
                    reason: droidAttribs,
                    pp: 0,
                });

                if (submitToRecent) {
                    insertRecentScore(data);
                }

                continue;
            }

            if (submitToRecent) {
                const osuAttribs = await this.osuDifficultyCalculator
                    .calculateReplayPerformance(replay, droidAttribs.params)
                    .catch((e: Error) => e.message);

                insertRecentScore(
                    data,
                    apiBeatmap,
                    droidAttribs,
                    typeof osuAttribs === "string" ? undefined : osuAttribs
                );
            }

            if (isBanned) {
                // No need to continue with submission if the player is dpp-banned.
                preFillStatuses({
                    success: false,
                    reason: "Player is banned from system",
                    pp: 0,
                });
                continue;
            }

            const submissionValidity = await this.checkSubmissionValidity(
                apiBeatmap
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
                    case DPPSubmissionValidity.scoreUsesCustomStats:
                        reason = "Score uses custom statistics";
                        break;
                }

                statuses.push({ success: false, reason: reason, pp: 0 });
                continue;
            }

            const saveReplayStatus = await saveReplay(uid, replay);
            if (!saveReplayStatus) {
                statuses.push({
                    success: false,
                    reason: "Replay saving failed",
                    pp: 0,
                });

                continue;
            }

            const ppEntry = DPPUtil.scoreToPPEntry(
                apiBeatmap,
                uid,
                data,
                droidAttribs
            );

            let replayNeedsPersistence = false;

            if (this.checkScoreInsertion(bindInfo.pp, ppEntry)) {
                ppEntry.pp = MathUtils.round(droidAttribs.result.total, 2);

                replayNeedsPersistence = this.insertScore(bindInfo.pp, ppEntry);
            }

            // TODO: uncomment this in the next rebalance
            // if (
            //     replay.scoreID > 0 &&
            //     !(await wasBeatmapSubmitted(uid, data.hash))
            // ) {
            //     ++playCountIncrement;
            // }

            if (replayNeedsPersistence) {
                const persistenceResult = await persistReplay(
                    bindInfo.uid,
                    replay
                );

                if (!persistenceResult) {
                    statuses.push({
                        success: false,
                        reason: "Replay persistence failed",
                        pp: ppEntry.pp,
                    });

                    continue;
                }
            }

            ++playCountIncrement;
            statuses.push({
                success: true,
                replayNeedsPersistence: replayNeedsPersistence,
                pp: ppEntry.pp,
            });
        }

        const newTotal = this.calculateFinalPerformancePoints(
            bindInfo.pp,
            bindInfo.playc + playCountIncrement
        );

        if (recentPlays.length > 0) {
            await DatabaseManager.aliceDb.collections.recentPlays
                .insert(...recentPlays)
                .catch(() => null);
        }

        const updateResult = await DatabaseManager.elainaDb.collections.userBind
            .updateOne(
                { discordid: bindInfo.discordid },
                {
                    $set: {
                        pptotal: newTotal,
                        pp: bindInfo.pp,
                        weightedAccuracy: this.calculateWeightedAccuracy(
                            bindInfo.pp
                        ),
                    },
                    $inc: {
                        playc: playCountIncrement,
                    },
                }
            )
            .catch(() => null);

        if (!updateResult) {
            for (const status of statuses) {
                status.success = false;
                status.reason = "Score submission to database failed";
            }

            return {
                ppGained: 0,
                newTotalPP: bindInfo.pptotal,
                playCountIncrement: 0,
                statuses: statuses,
            };
        }

        await this.updateDiscordMetadata(bindInfo.discordid);

        return {
            ppGained: MathUtils.round(newTotal - bindInfo.pptotal, 2),
            newTotalPP: MathUtils.round(newTotal, 2),
            playCountIncrement: playCountIncrement,
            statuses: statuses,
        };
    }

    /**
     * Calculates the final performance points from a list of pp entries.
     *
     * @param list The list.
     * @param playCount The play count of the player.
     * @returns The final performance points.
     */
    static calculateFinalPerformancePoints(
        list: PPEntry[],
        playCount: number
    ): number {
        return (
            // Main pp portion
            list
                .sort((a, b) => b.pp - a.pp)
                .reduce((a, v, i) => a + v.pp * Math.pow(0.95, i), 0) +
            // Bonus pp portion
            // TODO: uncomment this after rebalance
            // (1250 / 3) * (1 - Math.pow(0.9992, playCount))
            0
        );
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
     * Deletes the score of a player from the database.
     *
     * @param uid The uid of the player.
     * @param hash The MD5 hash of the played beatmap.
     */
    static async deleteScore(uid: number, hash: string): Promise<void> {
        const bindInfo =
            await DatabaseManager.elainaDb.collections.userBind.getFromUid(uid);

        if (!bindInfo) {
            return;
        }

        const scoreIndex = bindInfo.pp.findIndex((p) => p.hash === hash);
        if (scoreIndex === -1) {
            return;
        }

        bindInfo.pp.splice(scoreIndex, 1);

        const bindUpdateResult =
            await DatabaseManager.elainaDb.collections.userBind
                .updateOne(
                    { discordid: bindInfo.discordid },
                    {
                        $set: {
                            pptotal: this.calculateFinalPerformancePoints(
                                bindInfo.pp,
                                bindInfo.playc - 1
                            ),
                            pp: bindInfo.pp,
                            weightedAccuracy: this.calculateWeightedAccuracy(
                                bindInfo.pp
                            ),
                        },
                        $inc: {
                            playc: -1,
                        },
                    }
                )
                .catch(() => null);

        if (!bindUpdateResult) {
            return;
        }

        const recentUpdateResult =
            await DatabaseManager.aliceDb.collections.recentPlays.deleteMany({
                uid: uid,
                hash: hash,
            });

        if (!recentUpdateResult) {
            return;
        }

        await this.updateDiscordMetadata(bindInfo.discordid);
    }

    /**
     * Initiates replay processing.
     */
    static async initiateReplayProcessing(): Promise<void> {
        const processReplay = async (path: string) => {
            if (!path.endsWith(".odr")) {
                return deleteUnprocessedReplay(path);
            }

            const file = await readFile(path).catch(() => null);
            if (!file) {
                return;
            }

            const filenameSplit = basename(path).split("_");
            const scoreId =
                filenameSplit.length === 2 ? parseInt(filenameSplit[0]) : 0;

            const analyzer = new ReplayAnalyzer({ scoreID: scoreId });
            analyzer.originalODR = file;
            await analyzer.analyze().catch(() => {});

            const result = await this.submitReplay(
                [analyzer],
                undefined,
                true
            ).catch(() => null);

            if (result) {
                await deleteUnprocessedReplay(path);
            }
        };

        watch(join(unprocessedReplayDirectory, "*.odr"), {
            awaitWriteFinish: true,
        }).on("add", processReplay);

        const replayFiles = await readdir(unprocessedReplayDirectory).catch(
            () => null
        );

        if (!replayFiles) {
            return;
        }

        console.log(
            "Processing",
            replayFiles?.length ?? 0,
            "unprocessed replay file(s)"
        );

        for (const replayFile of replayFiles ?? []) {
            await processReplay(replayFile);
        }

        console.log("Unprocessed replay file(s) processing complete");
    }

    /**
     * Checks a beatmap's submission validity.
     *
     * @param beatmap The beatmap.
     * @returns The validity of the beatmap.
     */
    private static async checkSubmissionValidity(
        beatmap: MapInfo
    ): Promise<DPPSubmissionValidity>;

    /**
     * Checks a score's submission validity.
     *
     * @param score The score.
     * @returns The validity of the score.
     */
    private static async checkSubmissionValidity(
        score: Score
    ): Promise<DPPSubmissionValidity>;

    private static async checkSubmissionValidity(
        beatmapOrScore: Score | MapInfo
    ): Promise<DPPSubmissionValidity> {
        const apiBeatmap =
            beatmapOrScore instanceof MapInfo
                ? beatmapOrScore
                : await getBeatmap(beatmapOrScore.hash);

        if (!apiBeatmap) {
            return DPPSubmissionValidity.beatmapNotFound;
        }

        switch (true) {
            case beatmapOrScore instanceof Score &&
                (beatmapOrScore.forceCS !== undefined ||
                    beatmapOrScore.forceAR !== undefined ||
                    beatmapOrScore.forceOD !== undefined ||
                    beatmapOrScore.forceHP !== undefined):
                return DPPSubmissionValidity.scoreUsesCustomStats;
            case apiBeatmap.approved === RankedStatus.loved &&
                (apiBeatmap.hitLength < 30 ||
                    apiBeatmap.hitLength / apiBeatmap.totalLength < 0.6):
                return DPPSubmissionValidity.beatmapTooShort;
            case await WhitelistUtil.isBlacklisted(apiBeatmap.beatmapId):
                return DPPSubmissionValidity.beatmapIsBlacklisted;
            case WhitelistUtil.beatmapNeedsWhitelisting(apiBeatmap.approved) &&
                (await WhitelistUtil.getBeatmapWhitelistStatus(
                    apiBeatmap.hash
                )) !== "updated":
                return DPPSubmissionValidity.beatmapNotWhitelisted;
            default:
                return DPPSubmissionValidity.valid;
        }
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

        const currentEntry =
            list.find((p) => p.hash === entry.hash) ?? list[list.length - 1];

        return currentEntry.pp < entry.pp;
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
            DroidDifficultyAttributes,
            DroidPerformanceAttributes
        >
    ): PPEntry {
        return {
            uid: playerId,
            hash: beatmap.hash,
            title: beatmap.fullTitle,
            pp: MathUtils.round(calculationResult.result.total, 2),
            mods: calculationResult.difficultyAttributes.mods.reduce(
                (a, v) => a + v.acronym,
                ""
            ),
            accuracy: MathUtils.round(
                calculationResult.params.accuracy.value() * 100,
                2
            ),
            combo:
                calculationResult.params.combo ??
                calculationResult.difficultyAttributes.maxCombo,
            miss: calculationResult.params.accuracy.nmiss,
            speedMultiplier:
                replayData.speedMultiplier !== 1
                    ? replayData.speedMultiplier
                    : undefined,
            forceCS: replayData.forceCS,
            forceAR: replayData.forceAR,
            forceOD: replayData.forceOD,
            forceHP: replayData.forceHP,
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

        const existingScoreIndex = list.findIndex((p) => p.hash === entry.hash);
        let replayNeedsPersistence = false;

        if (existingScoreIndex !== -1) {
            if (list[existingScoreIndex].pp < entry.pp) {
                list[existingScoreIndex] = entry;
                replayNeedsPersistence = true;
            }
        } else {
            list.push(entry);
            replayNeedsPersistence = true;
        }

        list.sort((a, b) => b.pp - a.pp);

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
