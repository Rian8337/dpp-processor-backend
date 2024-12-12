import { readFile, unlink } from "fs/promises";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import { join } from "path";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";
import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { config } from "dotenv";
import { Accuracy, RankedStatus } from "@rian8337/osu-base";
import { RowDataPacket } from "mysql2";
import { officialPool } from "./database/official/OfficialDatabasePool";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import {
    insertBestScore,
    parseOfficialScoreMods,
} from "./database/official/officialDatabaseUtil";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";
import { OfficialDatabaseScore } from "./database/official/schema/OfficialDatabaseScore";
import { PerformanceCalculationParameters } from "./utils/calculator/PerformanceCalculationParameters";
import { getBeatmap } from "./utils/cache/beatmapStorage";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseScoreCalculation } from "./database/processor/schema/ProcessorDatabaseScoreCalculation";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import {
    getOfficialBestReplay,
    officialReplayDirectory,
    onlineReplayDirectory,
    saveReplayToOfficialPP,
} from "./utils/replayManager";
import { Score } from "@rian8337/osu-droid-utilities";
import { sortAlphabet } from "./utils/util";
import { constructModString } from "./utils/dppUtil";

config();

function obtainOfficialScore(
    scoreId: number,
): Promise<OfficialDatabaseScore | null> {
    return officialPool
        .query<RowDataPacket[]>(
            `SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.score)} WHERE id = ?;`,
            [scoreId],
        )
        .then((res) => (res[0] as OfficialDatabaseScore[]).at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

function obtainOfficialBestScore(
    scoreId: number,
): Promise<OfficialDatabaseBestScore | null> {
    return officialPool
        .query<RowDataPacket[]>(
            `SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} WHERE id = ?;`,
            [scoreId],
        )
        .then((res) => (res[0] as OfficialDatabaseBestScore[]).at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

function isReplayValid(
    databaseScore: OfficialDatabaseScore,
    replayData: ReplayData,
): boolean {
    // Wrap the score in a Score object.
    const score = new Score({
        ...databaseScore,
        username: "",
        mode: databaseScore.mode ?? "-",
        date: databaseScore.date.getTime(),
    });

    // For replay v1 and v2, there is not that much information - just check the accuracy and hash.
    if (
        score.hash !== replayData.hash ||
        !score.accuracy.equals(replayData.accuracy)
    ) {
        return false;
    }

    // Replay v3 has way more information - compare all relevant ones.
    if (replayData.isReplayV3()) {
        if (
            score.score !== replayData.score ||
            score.combo !== replayData.maxCombo ||
            databaseScore.geki !== replayData.hit300k ||
            databaseScore.katu !== replayData.hit100k ||
            score.rank !== replayData.rank
        ) {
            return false;
        }

        // Mods are compared later as they are more costly.
        const scoreMods = sortAlphabet(
            score.mods.reduce((a, v) => a + v.droidString, ""),
        );

        const replayMods = sortAlphabet(
            replayData.convertedMods.reduce((a, v) => a + v.droidString, ""),
        );

        if (scoreMods !== replayMods) {
            return false;
        }
    }

    // Replay v4 only has speed multiplier.
    if (
        replayData.isReplayV4() &&
        score.speedMultiplier !== replayData.speedMultiplier
    ) {
        return false;
    }

    // Replay v5 has forced statistics.
    if (
        replayData.isReplayV5() &&
        (score.forceCS !== replayData.forceCS ||
            score.forceAR !== replayData.forceAR ||
            score.forceOD !== replayData.forceOD ||
            score.forceHP !== replayData.forceHP)
    ) {
        return false;
    }

    // Replay v6? Well... nothing new to check there, so let's end it here.
    return true;
}

async function invalidateScore(scoreId: number) {
    const connection = await officialPool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            `UPDATE ${constructOfficialDatabaseTableName(
                OfficialDatabaseTables.score,
            )} SET pp = NULL WHERE id = ?;`,
            [scoreId],
        );

        await connection.query(
            `DELETE FROM ${constructOfficialDatabaseTableName(
                OfficialDatabaseTables.bestScore,
            )} WHERE id = ?;`,
            [scoreId],
        );

        await connection.commit();
    } catch {
        await connection.rollback();
    } finally {
        connection.release();
    }

    await unlink(
        join(officialReplayDirectory, `${scoreId.toString()}.odr`),
    ).catch(() => null);
}

function obtainOverrideParameters(
    score: OfficialDatabaseScore,
    replay: ReplayAnalyzer,
): PerformanceCalculationParameters | null {
    const { data } = replay;

    if (!data || data.isReplayV3()) {
        return null;
    }

    const parsedMods = parseOfficialScoreMods(score.mode);

    return new PerformanceCalculationParameters({
        accuracy: new Accuracy({
            n300: score.perfect,
            n100: score.good,
            n50: score.bad,
            nmiss: score.miss,
        }),
        combo: score.combo,
        mods: parsedMods.mods,
        customSpeedMultiplier: parsedMods.speedMultiplier,
        forceAR: parsedMods.forceAR,
        forceCS: parsedMods.forceCS,
        forceHP: parsedMods.forceHP,
        forceOD: parsedMods.forceOD,
        oldStatistics: parsedMods.oldStatistics,
    });
}

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

DatabaseManager.init()
    .then(async () => {
        const accountTransfers = new Map<number, number[]>();

        await DatabaseManager.aliceDb.collections.accountTransfer
            .get(
                {},
                { projection: { _id: 0, transferUid: 1, transferList: 1 } },
            )
            .then((transfers) => {
                for (const transfer of transfers) {
                    accountTransfers.set(
                        transfer.transferUid,
                        transfer.transferList,
                    );
                }
            })
            .catch((e: unknown) => {
                console.error("Failed to fetch account transfers", e);
            });

        // Modify this for starting point
        const processId = 0;

        let id = await processorPool
            .query<ProcessorDatabaseScoreCalculation>(
                `SELECT score_id FROM ${ProcessorDatabaseTables.scoreCalculation} WHERE process_id = $1;`,
                [processId],
            )
            .then((res) => res.rows.at(0)?.score_id ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch calculation progress", e);

                process.exit(1);
            });

        if (!id) {
            // Modify this for starting point
            id = 207695;

            await processorPool.query(
                `INSERT INTO ${ProcessorDatabaseTables.scoreCalculation} (process_id, score_id) VALUES ($1, $2);`,
                [processId, id],
            );
        }

        const scoreTable = constructOfficialDatabaseTableName(
            OfficialDatabaseTables.score,
        );

        const bestScoreTable = constructOfficialDatabaseTableName(
            OfficialDatabaseTables.bestScore,
        );

        // Modify this for ending point
        while (id <= 2600000) {
            const scoreId = id++;

            await processorPool.query(
                `UPDATE ${ProcessorDatabaseTables.scoreCalculation} SET score_id = $1 WHERE process_id = $2;`,
                [scoreId, processId],
            );

            // Get the current score.
            const score = await obtainOfficialScore(scoreId);
            if (!score || score.score === 0) {
                console.log("Score ID", scoreId, "does not exist");

                await invalidateScore(scoreId);
                continue;
            }

            // Obtain the beatmap of the score.
            const beatmap = await getBeatmap(score.hash);

            if (
                !beatmap ||
                (beatmap.ranked_status !== RankedStatus.ranked &&
                    beatmap.ranked_status !== RankedStatus.approved)
            ) {
                console.log("Score ID", scoreId, "has an unranked beatmap");

                // Beatmap is not found - mark the score's pp as null and delete the best score.
                await invalidateScore(scoreId);
                continue;
            }

            // Determine the highest pp play among all scores.
            let highestPP: number | null = null;
            let highestPPReplay: ReplayAnalyzer | null = null;

            // Obtain the replay of the top score in terms of score.
            const scoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
            scoreReplay.originalODR = await readFile(
                join(onlineReplayDirectory, `${scoreId.toString()}.odr`),
            ).catch(() => null);

            if (scoreReplay.originalODR) {
                await scoreReplay.analyze().catch(() => {
                    console.error(
                        "Top score replay of score ID",
                        scoreId,
                        scoreReplay.originalODR
                            ? "cannot be parsed"
                            : "does not exist",
                    );
                });
            }

            let connection = await officialPool.getConnection();

            try {
                await connection.beginTransaction();

                // Update the filename of the score.
                await connection.query(
                    `UPDATE ${scoreTable} SET filename = ? WHERE id = ?;`,
                    [beatmap.title, scoreId],
                );

                if (
                    scoreReplay.data &&
                    isReplayValid(score, scoreReplay.data)
                ) {
                    // Calculate the pp value of the score.
                    const overrideParameters = obtainOverrideParameters(
                        score,
                        scoreReplay,
                    );

                    const calcResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            scoreReplay,
                            false,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
                            console.error(
                                `Failed to calculate score with ID ${scoreId.toString()}:`,
                                (e as Error).message,
                            );

                            return null;
                        });

                    // Update the pp value of the score.
                    await connection.query(
                        `UPDATE ${scoreTable} SET pp = ? WHERE id = ?;`,
                        [calcResult?.result.total ?? null, scoreId],
                    );

                    if (calcResult !== null) {
                        highestPP = calcResult.result.total;
                        highestPPReplay = scoreReplay;
                    }
                } else {
                    // If the replay is not valid, invalidate the pp of the score.
                    await connection.query(
                        `UPDATE ${scoreTable} SET pp = NULL WHERE id = ?;`,
                        [scoreId],
                    );
                }

                await connection.commit();
            } catch (e) {
                console.error("Cannot calculate top score replay:", e);

                await connection.rollback();
            } finally {
                connection.release();
            }

            // Get the current best score.
            const bestScore = await obtainOfficialBestScore(scoreId);
            // Obtain the replay of the top score in terms of score.
            const bestScoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
            bestScoreReplay.originalODR = await getOfficialBestReplay(scoreId);

            if (bestScoreReplay.originalODR) {
                await bestScoreReplay.analyze().catch(() => {
                    console.error(
                        "Best pp score replay of score ID",
                        scoreId,
                        bestScoreReplay.originalODR
                            ? "cannot be parsed"
                            : "does not exist",
                    );
                });
            }

            connection = await officialPool.getConnection();

            try {
                await connection.beginTransaction();

                // Update the filename of the best score.
                await connection.query(
                    `UPDATE ${bestScoreTable} SET filename = ? WHERE id = ?;`,
                    [beatmap.title, scoreId],
                );

                if (bestScoreReplay.data) {
                    if (
                        bestScore &&
                        !isReplayValid(bestScore, bestScoreReplay.data)
                    ) {
                        // If the replay is not valid, delete the whole score.
                        await connection.query(
                            `DELETE FROM ${bestScoreTable} WHERE id = ?;`,
                            [scoreId],
                        );

                        await unlink(
                            join(
                                officialReplayDirectory,
                                `${scoreId.toString()}.odr`,
                            ),
                        ).catch(() => null);
                    } else {
                        // Calculate the pp value of the best score.
                        const overrideParameters = bestScore
                            ? obtainOverrideParameters(
                                  bestScore,
                                  bestScoreReplay,
                              )
                            : null;

                        const calcResult = await difficultyCalculator
                            .calculateReplayPerformance(
                                bestScoreReplay,
                                false,
                                overrideParameters,
                            )
                            .catch((e: unknown) => {
                                console.error(
                                    `Failed to calculate best score with ID ${scoreId.toString()}:`,
                                    (e as Error).message,
                                );

                                return null;
                            });

                        if (calcResult !== null) {
                            // Update the pp value of the best score.
                            await connection.query(
                                `UPDATE ${bestScoreTable} SET pp = ? WHERE id = ?;`,
                                [calcResult.result.total, scoreId],
                            );

                            if (
                                highestPP === null ||
                                calcResult.result.total > highestPP
                            ) {
                                highestPP = calcResult.result.total;
                                highestPPReplay = bestScoreReplay;
                            }
                        } else {
                            // If the pp value is null, delete the whole score.
                            await connection.query(
                                `DELETE FROM ${bestScoreTable} WHERE id = ?;`,
                                [scoreId],
                            );
                        }
                    }
                }

                await connection.commit();
            } catch (e) {
                console.error("Cannot calculate best score replay:", e);

                await connection.rollback();
            } finally {
                connection.release();
            }

            // Process all dpp-stored replays of the beatmap from the player.
            // for (const uid of accountTransfers.get(score.uid) ?? [score.uid]) {
            //     const replays = await readdir(
            //         join(localReplayDirectory, uid.toString(), score.hash),
            //     ).catch(() => null);

            //     if (!replays) {
            //         continue;
            //     }

            //     for (const replay of replays) {
            //         const dppReplayDir = join(
            //             localReplayDirectory,
            //             uid.toString(),
            //             score.hash,
            //             replay,
            //         );

            //         const dppReplay = new ReplayAnalyzer({ scoreID: score.id });
            //         dppReplay.originalODR = await readFile(dppReplayDir).catch(
            //             () => null,
            //         );

            //         if (dppReplay.originalODR) {
            //             await dppReplay.analyze().catch(() => {
            //                 console.error(
            //                     "dpp-stored replay of score ID",
            //                     scoreId,
            //                     "with filename",
            //                     replay,
            //                     scoreReplay.originalODR
            //                         ? "cannot be parsed"
            //                         : "does not exist",
            //                 );
            //             });
            //         }

            //         if (!dppReplay.data) {
            //             continue;
            //         }

            //         const calcResult = await difficultyCalculator
            //             .calculateReplayPerformance(dppReplay, false)
            //             .catch((e: unknown) => {
            //                 console.error(
            //                     `Failed to calculate dpp-stored replay with ID ${scoreId.toString()}:`,
            //                     (e as Error).message,
            //                 );

            //                 return null;
            //             });

            //         if (
            //             calcResult !== null &&
            //             (highestPP === null ||
            //                 calcResult.result.total > highestPP)
            //         ) {
            //             highestPP = calcResult.result.total;
            //             highestPPReplay = dppReplay;
            //         }
            //     }
            // }

            if (highestPP === null || !highestPPReplay?.data) {
                console.log("No valid replay found for score ID", scoreId);
                continue;
            }

            const { data: replayData } = highestPPReplay;

            // New best pp obtained - insert to the database.
            const newBestScore: OfficialDatabaseBestScore = {
                id: scoreId,
                uid: score.uid,
                filename: beatmap.title,
                hash: score.hash,
                mode: replayData.isReplayV3()
                    ? constructModString(replayData)
                    : score.mode,
                score: replayData.isReplayV3() ? replayData.score : score.score,
                combo: replayData.isReplayV3()
                    ? replayData.maxCombo
                    : score.combo,
                mark: replayData.isReplayV3() ? replayData.rank : score.mark,
                geki: replayData.isReplayV3() ? replayData.hit300k : score.geki,
                perfect: replayData.accuracy.n300,
                katu: replayData.isReplayV3() ? replayData.hit100k : score.katu,
                good: replayData.accuracy.n100,
                bad: replayData.accuracy.n50,
                miss: replayData.accuracy.nmiss,
                date: replayData.isReplayV3() ? replayData.time : score.date,
                accuracy: replayData.accuracy.value(),
                pp: highestPP,
            };

            highestPPReplay.scoreID = newBestScore.id;

            await insertBestScore(newBestScore);
            await saveReplayToOfficialPP(highestPPReplay);

            console.log(
                "Processed score ID",
                scoreId,
                "with a pp value of",
                highestPP,
            );
        }

        console.log("Process done");
    })
    .catch((e: unknown) => {
        console.error("Failed to initialize database manager", e);
    });
