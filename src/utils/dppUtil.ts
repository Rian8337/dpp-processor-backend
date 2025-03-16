import {
    ReplayAnalyzer,
    ReplayV3Data,
} from "@rian8337/osu-droid-replay-analyzer";
import {
    DroidDifficultyAttributes,
    OsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { getBeatmap } from "./cache/beatmapStorage";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { BeatmapDroidDifficultyCalculator } from "./calculator/BeatmapDroidDifficultyCalculator";
import {
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
    ModSuddenDeath,
    ModTraceable,
} from "@rian8337/osu-base";
import { PerformanceCalculationResult } from "./calculator/PerformanceCalculationResult";
import {
    deleteUnprocessedReplay,
    unprocessedReplayDirectory,
} from "./replayManager";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { BeatmapOsuDifficultyCalculator } from "./calculator/BeatmapOsuDifficultyCalculator";
import { IRecentPlay } from "../database/structures/aliceDb/IRecentPlay";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { readFile, readdir } from "fs/promises";
import { basename, join } from "path";
import { watch } from "chokidar";
import { ProcessorDatabaseBeatmap } from "../database/processor/schema/ProcessorDatabaseBeatmap";
import { getPlayerFromUsername } from "../database/official/officialDatabaseUtil";
import { isDebug } from "./util";

const droidDifficultyCalculator = new BeatmapDroidDifficultyCalculator();
const osuDifficultyCalculator = new BeatmapOsuDifficultyCalculator();

/**
 * Submits replays to the recent play database.
 *
 * @param replays The replays to submit.
 * @param uid The uid of the player, if any.
 * @returns An array of booleans denoting whether each replay has been successfully submitted.
 */
export async function submitReplay(
    replays: ReplayAnalyzer[],
    uid?: number,
): Promise<boolean[]> {
    const successes: boolean[] = [];
    const recentPlays: IRecentPlay[] = [];

    const preFillSuccesses = (success: boolean) => {
        while (successes.length < replays.length) {
            successes.push(success);
        }
    };

    const insertRecentScore = (
        replay: ReplayAnalyzer,
        beatmap?: ProcessorDatabaseBeatmap,
        droidAttribs?: PerformanceCalculationResult<
            DroidDifficultyAttributes,
            DroidPerformanceAttributes
        > | null,
        osuAttribs?: PerformanceCalculationResult<
            OsuDifficultyAttributes,
            OsuPerformanceAttributes
        > | null,
    ) => {
        if (!replay.data?.isReplayV3()) {
            return;
        }

        const { data } = replay;

        const recentPlay: IRecentPlay = {
            uid: uid!,
            accuracy: {
                ...data.accuracy,
            },
            title: beatmap?.title ?? data.fileName.replace(".osu", ""),
            combo: data.maxCombo,
            date: new Date(),
            score: data.score,
            rank: data.rank,
            mods: data.convertedMods.reduce((a, v) => a + v.acronym, ""),
            hash: beatmap?.hash ?? data.hash,
            scoreId: replay.scoreID,
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

        if (data.isReplayV4() && data.speedMultiplier !== 1) {
            recentPlay.speedMultiplier = data.speedMultiplier;
        }

        if (data.isReplayV5()) {
            if (data.forceCS !== undefined) {
                recentPlay.forceCS = data.forceCS;
            }
            if (data.forceAR !== undefined) {
                recentPlay.forceAR = data.forceAR;
            }
            if (data.forceOD !== undefined) {
                recentPlay.forceOD = data.forceOD;
            }
            if (data.forceHP !== undefined) {
                recentPlay.forceHP = data.forceHP;
            }
        }

        // Re-set date to update to current date
        recentPlay.date = new Date();
        recentPlays.push(recentPlay);
    };

    if (uid === undefined) {
        for (const replay of replays) {
            if (!replay.data?.isReplayV3()) {
                successes.push(false);
                continue;
            }

            const player = await getPlayerFromUsername(
                replay.data.playerName,
                "id",
            );

            if (!player) {
                successes.push(false);
                continue;
            }

            uid = player.id;
            break;
        }

        if (!uid) {
            preFillSuccesses(false);

            return successes;
        }
    }

    const bindInfo =
        await DatabaseManager.elainaDb.collections.userBind.getFromUid(uid);

    for (const replay of replays) {
        const { data, originalODR } = replay;

        if (!data || !originalODR) {
            successes.push(false);
            continue;
        }

        const beatmap = await getBeatmap(data.hash);

        if (!beatmap) {
            successes.push(true);
            insertRecentScore(replay);
            continue;
        }

        const droidAttribs = await droidDifficultyCalculator
            .calculateReplayPerformance(replay)
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        const osuAttribs = await osuDifficultyCalculator
            .calculateReplayPerformance(replay)
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        insertRecentScore(replay, beatmap, droidAttribs, osuAttribs);

        successes.push(true);
    }

    if (bindInfo) {
        await DatabaseManager.aliceDb.collections.recentPlays.insert(
            ...recentPlays,
        );

        await updateDiscordMetadata(bindInfo.discordid);
    }

    return successes;
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

        const result = await submitReplay([analyzer]).catch((e: unknown) => {
            console.error("Error when processing replay:\n", e);

            return null;
        });

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

const replayModsConstants = {
    MOD_AUTO: new ModAuto().droidString,
    MOD_AUTOPILOT: new ModAutopilot().droidString,
    MOD_NOFAIL: new ModNoFail().droidString,
    MOD_EASY: new ModEasy().droidString,
    MOD_HIDDEN: new ModHidden().droidString,
    MOD_TRACEABLE: new ModTraceable().droidString,
    MOD_HARDROCK: new ModHardRock().droidString,
    MOD_DOUBLETIME: new ModDoubleTime().droidString,
    MOD_HALFTIME: new ModHalfTime().droidString,
    MOD_NIGHTCORE: new ModNightCore().droidString,
    MOD_PRECISE: new ModPrecise().droidString,
    MOD_SMALLCIRCLE: new ModSmallCircle().droidString,
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
