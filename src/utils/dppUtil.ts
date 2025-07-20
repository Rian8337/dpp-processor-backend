import {
    IDroidDifficultyAttributes,
    IOsuDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    HitResult,
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { watch } from "chokidar";
import { readFile, readdir } from "fs/promises";
import { basename, join } from "path";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { getPlayerFromUsername } from "../database/official/officialDatabaseUtil";
import { ProcessorDatabaseBeatmap } from "../database/processor/schema/ProcessorDatabaseBeatmap";
import { IRecentPlay } from "../database/structures/aliceDb/IRecentPlay";
import { DroidPerformanceAttributes } from "../structures/attributes/DroidPerformanceAttributes";
import { OsuPerformanceAttributes } from "../structures/attributes/OsuPerformanceAttributes";
import { getBeatmap } from "./cache/beatmapStorage";
import { BeatmapDroidDifficultyCalculator } from "./calculator/BeatmapDroidDifficultyCalculator";
import { BeatmapOsuDifficultyCalculator } from "./calculator/BeatmapOsuDifficultyCalculator";
import { PerformanceCalculationResult } from "./calculator/PerformanceCalculationResult";
import {
    deleteUnprocessedReplay,
    unprocessedReplayDirectory,
} from "./replayManager";
import { isDebug } from "./util";
import {
    IBeatmap,
    ScoreRank,
    Slider,
    SliderTail,
    SliderTick,
} from "@rian8337/osu-base";
import { Score } from "@rian8337/osu-droid-utilities";
import { isDeepStrictEqual } from "util";
import { OfficialDatabaseScore } from "../database/official/schema/OfficialDatabaseScore";
import { SliderTickInformation } from "../structures/SliderTickInformation";

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
            IDroidDifficultyAttributes,
            DroidPerformanceAttributes
        > | null,
        osuAttribs?: PerformanceCalculationResult<
            IOsuDifficultyAttributes,
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
            mods: data.convertedMods.serializeMods(),
            hash: beatmap?.hash ?? data.hash,
            scoreId: replay.scoreID,
        };

        if (droidAttribs) {
            recentPlay.droidAttribs = {
                params: droidAttribs.params.toCloneable(),
                difficulty: {
                    ...droidAttribs.difficultyAttributes,
                    mods: droidAttribs.difficultyAttributes.mods.serializeMods(),
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
                    mods: osuAttribs.difficultyAttributes.mods.serializeMods(),
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

/**
 * Checks a replay's validity against its score data.
 *
 * @param databaseScore The score to check against.
 * @param replayData The replay data to check.
 * @returns Whether the replay is valid.
 */
export function isReplayValid(
    databaseScore: Score | OfficialDatabaseScore,
    replayData: ReplayData,
): boolean {
    // Wrap the score in a Score object.
    const score =
        databaseScore instanceof Score
            ? databaseScore
            : new Score({
                  ...databaseScore,
                  username: "",
                  mark: databaseScore.mark as ScoreRank,
                  date: databaseScore.date.getTime(),
                  slider_tick_hit: databaseScore.sliderTickHit,
                  slider_end_hit: databaseScore.sliderEndHit,
              });

    // For replay v1 and v2, there is not that much information - just check the accuracy and hash.
    if (
        score.hash !== replayData.hash ||
        !score.accuracy.equals(replayData.accuracy) ||
        // Also check if the accuracy is "empty", as in there are no hits at all.
        Number.isNaN(replayData.accuracy.value())
    ) {
        return false;
    }

    // Replay v3 has way more information - compare all relevant ones.
    if (replayData.isReplayV3()) {
        if (
            score.score !== replayData.score ||
            score.combo !== replayData.maxCombo ||
            (!(databaseScore instanceof Score) &&
                (databaseScore.geki !== replayData.hit300k ||
                    databaseScore.katu !== replayData.hit100k)) ||
            score.rank !== replayData.rank
        ) {
            return false;
        }

        // Mods are compared later as they are more costly.
        const scoreMods = score.mods.serializeMods();
        const replayMods = replayData.convertedMods.serializeMods();

        if (!isDeepStrictEqual(scoreMods, replayMods)) {
            return false;
        }
    }

    // Replay v4? Well... nothing new to check there, so let's end it here.
    return true;
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

/**
 * Obtains the tick and end information for sliders in a replay.
 *
 * @param beatmap The beatmap to obtain the information for.
 * @param data The replay data to analyze.
 * @returns An object containing the tick and end information.
 */
export function obtainTickInformation(
    beatmap: IBeatmap,
    data: ReplayData,
): {
    readonly tick: SliderTickInformation;
    readonly end: SliderTickInformation;
} {
    const tick: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderTicks,
    };

    const end: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderEnds,
    };

    for (let i = 0; i < data.hitObjectData.length; ++i) {
        const object = beatmap.hitObjects.objects[i];
        const objectData = data.hitObjectData[i];

        if (
            objectData.result === HitResult.miss ||
            !(object instanceof Slider)
        ) {
            continue;
        }

        // Exclude the head circle.
        for (let j = 1; j < object.nestedHitObjects.length; ++j) {
            const nested = object.nestedHitObjects[j];

            if (!objectData.tickset[j - 1]) {
                continue;
            }

            if (nested instanceof SliderTick) {
                ++tick.obtained;
            } else if (nested instanceof SliderTail) {
                ++end.obtained;
            }
        }
    }

    return { tick, end };
}
