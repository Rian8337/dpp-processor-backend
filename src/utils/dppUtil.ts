import {
    ReplayAnalyzer,
    ReplayData,
    ReplayV3Data,
} from "@rian8337/osu-droid-replay-analyzer";
import { Player, Score } from "@rian8337/osu-droid-utilities";
import {
    DroidDifficultyAttributes,
    ExtendedDroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { getBeatmap } from "./cache/beatmapStorage";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { BeatmapDroidDifficultyCalculator } from "./calculator/BeatmapDroidDifficultyCalculator";
import {
    MathUtils,
    ModAuto,
    ModAutopilot,
    ModDoubleTime,
    ModEasy,
    ModFlashlight,
    ModHalfTime,
    ModHardRock,
    ModHidden,
    ModNightCore,
    ModNoFail,
    ModPerfect,
    ModPrecise,
    ModReallyEasy,
    ModRelax,
    ModScoreV2,
    ModSmallCircle,
    ModSpeedUp,
    ModSuddenDeath,
    RankedStatus,
} from "@rian8337/osu-base";
import { PerformanceCalculationResult } from "./calculator/PerformanceCalculationResult";
import { DPPSubmissionValidity } from "../enums/DPPSubmissionValidity";
import {
    beatmapNeedsWhitelisting,
    getBeatmapWhitelistStatus,
    isBlacklisted,
} from "./whitelistUtil";
import { PPEntry } from "../structures/PPEntry";
import { PPSubmissionStatus } from "../structures/PPSubmissionStatus";
import {
    deleteUnprocessedReplay,
    persistReplayToDppSystem,
    saveReplayToDppSystem,
    saveReplayToOfficialPP,
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
import { ProcessorDatabaseBeatmap } from "../database/processor/schema/ProcessorDatabaseBeatmap";
import {
    insertBestScore,
    getOfficialBestScore,
    getOfficialScore,
    getPlayerFromUsername,
    updateOfficialScorePPValue,
    updateUserPPProfile,
} from "../database/official/officialDatabaseUtil";
import { isDebug } from "./util";

const droidDifficultyCalculator = new BeatmapDroidDifficultyCalculator();
const osuDifficultyCalculator = new BeatmapOsuDifficultyCalculator();

/**
 * Submits replays to the dpp database.
 *
 * @param replays The replays to submit.
 * @param uid The uid of the player, if any.
 * @param submitAsRecent Whether to submit these replays as recent plays. Defaults to `false`.
 * @returns Whether the submission for each replay was successful.
 */
export async function submitReplay(
    replays: ReplayAnalyzer[],
    uid?: number,
    submitAsRecent?: boolean,
): Promise<PPSubmissionOperationResult> {
    const statuses: PPSubmissionStatus[] = [];
    const recentPlays: IRecentPlay[] = [];
    let playCountIncrement = 0;

    const preFillStatuses = (message: PPSubmissionStatus) => {
        while (statuses.length < replays.length) {
            statuses.push(message);
        }
    };

    const insertRecentScore = (
        replayData: ReplayData,
        scoreId: number,
        beatmap?: ProcessorDatabaseBeatmap,
        droidAttribs?: PerformanceCalculationResult<
            DroidDifficultyAttributes,
            DroidPerformanceAttributes
        >,
        osuAttribs?: PerformanceCalculationResult<
            OsuDifficultyAttributes,
            OsuPerformanceAttributes
        >,
    ) => {
        if (!inGameDppSystem || !replayData.isReplayV3()) {
            return;
        }

        const recentPlay: IRecentPlay = {
            uid: uid!,
            accuracy: {
                ...replayData.accuracy,
            },
            title: beatmap?.title ?? replayData.fileName.replace(".osu", ""),
            combo: replayData.maxCombo,
            date: new Date(),
            score: replayData.score,
            rank: replayData.rank,
            mods: replayData.convertedMods.reduce((a, v) => a + v.acronym, ""),
            hash: beatmap?.hash ?? replayData.hash,
            scoreId: scoreId ? scoreId : undefined,
        };

        if (droidAttribs) {
            recentPlay.droidAttribs = {
                params: droidAttribs.params.toCloneable(),
                difficulty: {
                    ...droidAttribs.difficultyAttributes,
                    mods: droidAttribs.difficultyAttributes.mods.reduce(
                        (a, v) => a + v.acronym,
                        "",
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
                        "",
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

        if (replayData.isReplayV4() && replayData.speedMultiplier !== 1) {
            recentPlay.speedMultiplier = replayData.speedMultiplier;
        }

        if (replayData.isReplayV5()) {
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
        }

        // Re-set date to update to current date
        recentPlay.date = new Date();
        recentPlays.push(recentPlay);
    };

    if (uid === undefined) {
        for (const replay of replays) {
            if (!replay.data?.isReplayV3()) {
                statuses.push({
                    success: false,
                    reason: "Replay does not have any player name",
                    pp: 0,
                });
                continue;
            }

            const player = await getPlayerFromUsername(
                replay.data.playerName,
                "id",
            );

            if (!player) {
                statuses.push({
                    success: false,
                    reason: "Player not found",
                    pp: 0,
                });
                continue;
            }

            uid = player instanceof Player ? player.uid : player.id;
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

    const isBannedInDppSystem =
        await DatabaseManager.elainaDb.collections.dppBan.isPlayerBanned(uid);

    const dppSystemBindInfo =
        await DatabaseManager.elainaDb.collections.userBind.getFromUid(uid);

    const inGameDppSystem = dppSystemBindInfo
        ? ((await DatabaseManager.aliceDb.collections.inGamePP.getFromUid(
              uid,
          )) ?? {
              ...DatabaseManager.aliceDb.collections.inGamePP.defaultDocument,
              discordid: dppSystemBindInfo.discordid,
              uid: uid,
              prevpptotal: dppSystemBindInfo.pptotal,
              previous_bind: dppSystemBindInfo.previous_bind,
              username: dppSystemBindInfo.username,
          })
        : null;

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

        const beatmap = await getBeatmap(data.hash);

        if (!beatmap) {
            statuses.push({
                success: false,
                reason: "Beatmap not found",
                pp: 0,
            });

            if (submitAsRecent && data.isReplayV3()) {
                insertRecentScore(data, replay.scoreID);
            }

            continue;
        }

        const droidAttribs = await droidDifficultyCalculator
            .calculateReplayPerformance(replay)
            .catch((e: unknown) =>
                e instanceof Error ? e.message : "Calculation failed",
            );

        if (typeof droidAttribs === "string") {
            statuses.push({
                success: false,
                reason: droidAttribs,
                pp: 0,
            });

            if (submitAsRecent) {
                insertRecentScore(data, replay.scoreID);
            }

            continue;
        }

        // Handle submission for official pp first, then switch to dpp system.
        if (
            beatmap.ranked_status === RankedStatus.ranked ||
            beatmap.ranked_status === RankedStatus.approved
        ) {
            await submitReplayToOfficialPP(replay, uid, droidAttribs);
        }

        if (!dppSystemBindInfo) {
            statuses.push({
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

        if (submitAsRecent) {
            const osuAttribs = await osuDifficultyCalculator
                .calculateReplayPerformance(replay)
                .catch((e: unknown) =>
                    e instanceof Error ? e.message : "Calculation failed",
                );

            insertRecentScore(
                data,
                replay.scoreID,
                beatmap,
                droidAttribs,
                typeof osuAttribs === "string" ? undefined : osuAttribs,
            );
        }

        if (isBannedInDppSystem) {
            // No need to continue with submission if the player is dpp-banned.
            statuses.push({
                success: false,
                reason: "Player is banned from system",
                pp: 0,
            });

            continue;
        }

        const submissionValidity = await checkSubmissionValidity(beatmap);

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

        const ppEntry = scoreToPPEntry(beatmap, uid, data, droidAttribs);
        const isNewScore =
            replay.scoreID > 0 && !(await wasBeatmapSubmitted(uid, data.hash));

        if (isNewScore) {
            ++playCountIncrement;
        }

        if (
            inGameDppSystem &&
            (beatmap.ranked_status === RankedStatus.ranked ||
                beatmap.ranked_status === RankedStatus.approved)
        ) {
            insertScore(inGameDppSystem.pp, ppEntry, 100);

            if (isNewScore) {
                ++inGameDppSystem.playc;
            }
        }

        const saveReplayStatus = await saveReplayToDppSystem(uid, replay);

        if (!saveReplayStatus) {
            statuses.push({
                success: false,
                reason: "Replay saving failed",
                pp: 0,
            });

            continue;
        }

        let replayNeedsPersistence = false;

        if (checkScoreInsertion(dppSystemBindInfo.pp, ppEntry)) {
            ppEntry.pp = MathUtils.round(droidAttribs.result.total, 2);

            replayNeedsPersistence = insertScore(dppSystemBindInfo.pp, ppEntry);
        }

        if (replayNeedsPersistence) {
            const persistenceResult = await persistReplayToDppSystem(
                dppSystemBindInfo.uid,
                replay,
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

        statuses.push({
            success: true,
            replayNeedsPersistence: replayNeedsPersistence,
            pp: ppEntry.pp,
        });
    }

    if (dppSystemBindInfo) {
        const newTotal = calculateFinalPerformancePoints(
            dppSystemBindInfo.pp,
            dppSystemBindInfo.playc + playCountIncrement,
        );

        if (recentPlays.length > 0) {
            await DatabaseManager.aliceDb.collections.recentPlays
                .insert(...recentPlays)
                .catch(() => null);
        }

        const updateResult = await DatabaseManager.elainaDb.collections.userBind
            .updateOne(
                { discordid: dppSystemBindInfo.discordid },
                {
                    $set: {
                        pptotal: newTotal,
                        pp: dppSystemBindInfo.pp,
                        weightedAccuracy: calculateWeightedAccuracy(
                            dppSystemBindInfo.pp,
                        ),
                    },
                    $inc: {
                        playc: playCountIncrement,
                    },
                },
            )
            .catch(() => null);

        if (!updateResult) {
            for (const status of statuses) {
                status.success = false;
                status.reason = "Score submission to database failed";
            }

            return {
                ppGained: 0,
                newTotalPP: dppSystemBindInfo.pptotal,
                playCountIncrement: 0,
                statuses: statuses,
            };
        }

        await updateDiscordMetadata(dppSystemBindInfo.discordid);

        if (inGameDppSystem) {
            await DatabaseManager.aliceDb.collections.inGamePP.updateOne(
                { discordid: dppSystemBindInfo.discordid },
                {
                    $set: {
                        playc: inGameDppSystem.playc,
                        pptotal: calculateFinalPerformancePoints(
                            inGameDppSystem.pp,
                            inGameDppSystem.playc,
                        ),
                        pp: inGameDppSystem.pp,
                        prevpptotal: newTotal,
                    },
                    $setOnInsert: {
                        lastUpdate: Date.now(),
                        uid: dppSystemBindInfo.uid,
                        username: dppSystemBindInfo.username,
                        previous_bind: dppSystemBindInfo.previous_bind,
                    },
                },
                { upsert: true },
            );
        }

        return {
            ppGained: MathUtils.round(newTotal - dppSystemBindInfo.pptotal, 2),
            newTotalPP: MathUtils.round(newTotal, 2),
            playCountIncrement: playCountIncrement,
            statuses: statuses,
        };
    }

    return {
        ppGained: 0,
        newTotalPP: 0,
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
export function calculateFinalPerformancePoints(
    list: Pick<PPEntry, "pp">[],
    playCount: number,
): number {
    return (
        // Main pp portion
        list
            .sort((a, b) => b.pp - a.pp)
            .reduce((a, v, i) => a + v.pp * Math.pow(0.95, i), 0) +
        // Bonus pp portion
        calculateBonusPerformancePoints(playCount)
    );
}

/**
 * Calculates the bonus performance points of a player.
 *
 * @param playCount The play count of the player.
 * @returns The bonus performance points.
 */
export function calculateBonusPerformancePoints(playCount: number): number {
    return (1250 / 3) * (1 - Math.pow(0.9992, playCount));
}

/**
 * Calculates the weighted accuracy of a dpp list.
 *
 * @param list The list.
 * @returns The weighted accuracy of the list.
 */
export function calculateWeightedAccuracy(list: PPEntry[]): number {
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
export async function deleteScore(uid: number, hash: string): Promise<void> {
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

    const bindUpdateResult = await DatabaseManager.elainaDb.collections.userBind
        .updateOne(
            { discordid: bindInfo.discordid },
            {
                $set: {
                    pptotal: calculateFinalPerformancePoints(
                        bindInfo.pp,
                        bindInfo.playc - 1,
                    ),
                    pp: bindInfo.pp,
                    weightedAccuracy: calculateWeightedAccuracy(bindInfo.pp),
                },
                $inc: {
                    playc: -1,
                },
            },
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

    if (!recentUpdateResult.acknowledged) {
        return;
    }

    await updateDiscordMetadata(bindInfo.discordid);
}

/**
 * Initiates replay processing.
 */
export async function initiateReplayProcessing(): Promise<void> {
    if (isDebug) {
        return;
    }

    const processReplay = async (path: string) => {
        if (!path.endsWith(".odr")) {
            return deleteUnprocessedReplay(path);
        }

        const file = await readFile(path).catch((e: unknown) => {
            console.error("Error when reading replay file:\n", e);

            return null;
        });

        if (!file) {
            return;
        }

        const filenameSplit = basename(path).split("_");
        const scoreId =
            filenameSplit.length === 2 ? parseInt(filenameSplit[0]) : 0;

        const analyzer = new ReplayAnalyzer({ scoreID: scoreId });
        analyzer.originalODR = file;

        await analyzer.analyze().catch((e: unknown) => {
            console.error("Error when analyzing replay:\n", e);
        });

        const result = await submitReplay([analyzer], undefined, true).catch(
            (e: unknown) => {
                console.error("Error when processing replay:\n", e);

                return null;
            },
        );

        if (result) {
            await deleteUnprocessedReplay(path);
        }
    };

    watch(join(unprocessedReplayDirectory, "*.odr"), {
        awaitWriteFinish: true,
        ignoreInitial: true,
    }).on("add", processReplay);

    const replayFiles = await readdir(unprocessedReplayDirectory).catch(
        () => null,
    );

    if (!replayFiles) {
        return;
    }

    console.log("Processing", replayFiles.length, "unprocessed replay file(s)");

    for (const replayFile of replayFiles) {
        await processReplay(join(unprocessedReplayDirectory, replayFile));
    }

    console.log("Unprocessed replay file(s) processing complete");
}

async function submitReplayToOfficialPP(
    replay: ReplayAnalyzer,
    uid: number,
    scoreAttribs: PerformanceCalculationResult<
        ExtendedDroidDifficultyAttributes,
        DroidPerformanceAttributes
    >,
): Promise<void> {
    const { data } = replay;

    if (!data) {
        return;
    }

    const score = await getOfficialScore(uid, data.hash, true);

    if (!score) {
        return;
    }

    let bestScore = await getOfficialBestScore(uid, data.hash);

    // For overwriting scores, we need to update the pp value in the official score table.
    if (replay.scoreID > 0) {
        await updateOfficialScorePPValue(
            replay.scoreID,
            scoreAttribs.result.total,
        );
    }

    if (bestScore === null || bestScore.pp < scoreAttribs.result.total) {
        // New top play - update the score.
        bestScore = {
            ...score,
            accuracy: scoreAttribs.params.accuracy.value() * 100000,
            bad: scoreAttribs.params.accuracy.n50,
            combo:
                scoreAttribs.params.combo ??
                (data.isReplayV3() ? data.maxCombo : score.combo),
            geki: data.isReplayV3() ? data.hit300k : score.geki,
            good: data.isReplayV3() ? data.accuracy.n100 : score.good,
            date: data.isReplayV3() ? data.time : score.date,
            katu: data.isReplayV3() ? data.hit100k : score.katu,
            mark: data.isReplayV3() ? data.rank : score.mark,
            miss: scoreAttribs.params.accuracy.nmiss,
            mode: data.isReplayV3() ? constructModString(data) : score.mode,
            new_accuracy: scoreAttribs.params.accuracy.value(),
            perfect: scoreAttribs.params.accuracy.n300,
            pp: scoreAttribs.result.total,
            score: data.isReplayV3() ? data.score : score.score,
        };

        await insertBestScore(bestScore);
        await updateUserPPProfile(uid);
        await saveReplayToOfficialPP(replay);
    }
}

const replayModsConstants = {
    MOD_AUTO: new ModAuto().droidString,
    MOD_AUTOPILOT: new ModAutopilot().droidString,
    MOD_NOFAIL: new ModNoFail().droidString,
    MOD_EASY: new ModEasy().droidString,
    MOD_HIDDEN: new ModHidden().droidString,
    MOD_HARDROCK: new ModHardRock().droidString,
    MOD_DOUBLETIME: new ModDoubleTime().droidString,
    MOD_HALFTIME: new ModHalfTime().droidString,
    MOD_NIGHTCORE: new ModNightCore().droidString,
    MOD_PRECISE: new ModPrecise().droidString,
    MOD_SMALLCIRCLE: new ModSmallCircle().droidString,
    MOD_SPEEDUP: new ModSpeedUp().droidString,
    MOD_REALLYEASY: new ModReallyEasy().droidString,
    MOD_RELAX: new ModRelax().droidString,
    MOD_PERFECT: new ModPerfect().droidString,
    MOD_SUDDENDEATH: new ModSuddenDeath().droidString,
    MOD_SCOREV2: new ModScoreV2().droidString,
    MOD_FLASHLIGHT: new ModFlashlight().droidString,
} as const;

/**
 * Constructs a mod string from a replay data.
 *
 * @param data The replay data.
 * @returns The constructed mod string.
 */
export function constructModString(data: ReplayV3Data): string {
    let modString = "";

    for (const mod of data.rawMods) {
        for (const property in replayModsConstants) {
            if (!mod.includes(property)) {
                continue;
            }

            modString +=
                replayModsConstants[
                    property as keyof typeof replayModsConstants
                ];
            break;
        }
    }

    if (data.isReplayV4()) {
        modString += "|";
        let extraModString = "";

        if (data.speedMultiplier !== 1) {
            extraModString += `x${data.speedMultiplier.toFixed(2)}|`;
        }

        if (data.forceAR !== undefined) {
            extraModString += `AR${data.forceAR.toFixed(1)}|`;
        }

        if (data.isReplayV5()) {
            if (data.forceOD !== undefined) {
                extraModString += `OD${data.forceOD.toFixed(1)}|`;
            }

            if (data.forceCS !== undefined) {
                extraModString += `CS${data.forceCS.toFixed(1)}|`;
            }

            if (data.forceHP !== undefined) {
                extraModString += `HP${data.forceHP.toFixed(1)}|`;
            }
        }

        if (data.flashlightFollowDelay !== 0.12) {
            extraModString += `FLD${data.flashlightFollowDelay.toFixed(2)}|`;
        }

        if (extraModString) {
            modString += extraModString.slice(0, -1);
        }
    }

    return modString;
}

/**
 * Checks a beatmap or score's submission validity.
 *
 * @param beatmapOrScore The beatmap or score.
 * @returns The validity of the score.
 */
async function checkSubmissionValidity(
    beatmapOrScore: Score | ProcessorDatabaseBeatmap,
): Promise<DPPSubmissionValidity> {
    const beatmap =
        beatmapOrScore instanceof Score
            ? await getBeatmap(beatmapOrScore.hash)
            : beatmapOrScore;

    if (!beatmap) {
        return DPPSubmissionValidity.beatmapNotFound;
    }

    switch (true) {
        case beatmapOrScore instanceof Score &&
            (beatmapOrScore.forceCS !== undefined ||
                beatmapOrScore.forceAR !== undefined ||
                beatmapOrScore.forceOD !== undefined ||
                beatmapOrScore.forceHP !== undefined):
            return DPPSubmissionValidity.scoreUsesCustomStats;
        case beatmap.ranked_status === RankedStatus.loved &&
            (beatmap.hit_length < 30 ||
                beatmap.hit_length / beatmap.total_length < 0.6):
            return DPPSubmissionValidity.beatmapTooShort;
        case await isBlacklisted(beatmap.id):
            return DPPSubmissionValidity.beatmapIsBlacklisted;
        case beatmapNeedsWhitelisting(beatmap.ranked_status) &&
            (await getBeatmapWhitelistStatus(beatmap.hash)) !== "updated":
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
function checkScoreInsertion(list: PPEntry[], entry: PPEntry): boolean {
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
function scoreToPPEntry(
    beatmap: ProcessorDatabaseBeatmap,
    playerId: number,
    replayData: ReplayData,
    calculationResult: PerformanceCalculationResult<
        DroidDifficultyAttributes,
        DroidPerformanceAttributes
    >,
): PPEntry {
    return {
        uid: playerId,
        hash: beatmap.hash,
        title: beatmap.title,
        pp: MathUtils.round(calculationResult.result.total, 2),
        mods: calculationResult.difficultyAttributes.mods.reduce(
            (a, v) => a + v.acronym,
            "",
        ),
        accuracy: MathUtils.round(
            calculationResult.params.accuracy.value() * 100,
            2,
        ),
        combo:
            calculationResult.params.combo ??
            calculationResult.difficultyAttributes.maxCombo,
        miss: calculationResult.params.accuracy.nmiss,
        speedMultiplier:
            replayData.isReplayV4() && replayData.speedMultiplier !== 1
                ? replayData.speedMultiplier
                : undefined,
        forceCS: replayData.isReplayV5() ? replayData.forceCS : undefined,
        forceAR: replayData.isReplayV4() ? replayData.forceAR : undefined,
        forceOD: replayData.isReplayV5() ? replayData.forceOD : undefined,
        forceHP: replayData.isReplayV5() ? replayData.forceHP : undefined,
    };
}

/**
 * Inserts a score into a list of dpp plays.
 *
 * @param list The list of dpp plays.
 * @param entry The play to add.
 * @param sizeLimit The maximum size of the list. Defaults to 75.
 * @returns Whether the replay file associated with the play needs to be persisted.
 */
function insertScore(list: PPEntry[], entry: PPEntry, sizeLimit = 75): boolean {
    if (isNaN(entry.pp)) {
        return false;
    }

    if (list.length >= sizeLimit && list[list.length - 1].pp >= entry.pp) {
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

    while (list.length > sizeLimit) {
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
async function updateDiscordMetadata(userId: string): Promise<boolean> {
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
